import type { AuthorizedRoot, MediaCollection, MediaItem, MediaScanProgress, ProviderHealth } from "@/core/types";
import { ProviderOfflineError } from "@/core/errors";
import { generatedPalette } from "@/core/steam/artwork";
import { useMediaLibraryStore, type IndexedFile } from "@/state/mediaLibraryStore";
import { createLogger } from "@/lib/logger";
import type { MediaBridge } from "./MediaBridge";
import type { MediaProvider } from "./MediaProvider";

// PRIVACY: this logger must never receive paths or filenames — counts only.
const log = createLogger("media");

/**
 * Real local media provider. Everything is rooted in USER-AUTHORIZED folders:
 * the user picks a folder, the native layer validates/canonicalizes it and
 * grants the WebView access to that folder only. Indexing is local and bounded.
 */
export class LocalMediaProvider implements MediaProvider {
  readonly id = "local-media";
  private registered = false;

  constructor(private bridge: MediaBridge, private store = useMediaLibraryStore) {}

  /** Re-grant asset access for stored roots (called once per session). */
  async ensureRegistered(): Promise<void> {
    if (this.registered) return;
    this.registered = true;
    const s = this.store.getState();
    for (const root of s.roots) {
      try {
        const info = await this.bridge.registerRoot(root.path);
        s.updateRoot(root.id, { exists: info.exists, kind: info.kind });
      } catch {
        // Drive disconnected or folder removed: keep the authorization, mark unavailable.
        s.updateRoot(root.id, { exists: false });
      }
    }
    log.info("Media roots registered", { roots: s.roots.length });
  }

  private toItem(f: IndexedFile, favorites: Set<string>, collectionOf: Map<string, string>, roots: Map<string, AuthorizedRoot>, unavailable: Set<string>): MediaItem {
    const pal = generatedPalette(f.name);
    const root = roots.get(f.rootId);
    return {
      id: f.id,
      title: f.name,
      durationSeconds: 0,
      src: this.bridge.toAssetUrl(f.path),
      thumbnailColor: pal.cover,
      thumbnailUrl: null,
      addedAt: f.addedAt,
      collectionId: collectionOf.get(f.id) ?? null,
      favorite: favorites.has(f.id),
      private: true,
      rootId: f.rootId,
      folder: f.folder,
      ext: f.ext,
      sizeBytes: f.sizeBytes,
      playability: f.playability,
      available: (root?.exists ?? true) && !unavailable.has(f.id),
    };
  }

  async getItems(): Promise<readonly MediaItem[]> {
    await this.ensureRegistered();
    const s = this.store.getState();
    if (s.roots.length > 0 && s.roots.every((r) => r.exists === false)) {
      throw new ProviderOfflineError("Media", "Media source disconnected.");
    }
    const favorites = new Set(s.favorites);
    const unavailable = new Set(s.unavailable);
    const collectionOf = new Map<string, string>();
    for (const c of s.collections) for (const id of c.itemIds) collectionOf.set(id, c.id);
    const roots = new Map(s.roots.map((r) => [r.id, r]));
    return s.files.map((f) => this.toItem(f, favorites, collectionOf, roots, unavailable));
  }

  async getCollections(): Promise<readonly MediaCollection[]> {
    const s = this.store.getState();
    const favs: MediaCollection = { id: "favorites", name: "Favorites", itemCount: s.favorites.length, itemIds: s.favorites };
    return [favs, ...s.collections.map((c) => ({ id: c.id, name: c.name, itemCount: c.itemIds.length, itemIds: c.itemIds }))];
  }

  async getAuthorizedRoots(): Promise<readonly AuthorizedRoot[]> {
    await this.ensureRegistered();
    return this.store.getState().roots;
  }

  async authorizeRoot(): Promise<AuthorizedRoot | null> {
    const path = await this.bridge.pickFolder();
    if (!path) return null;
    const info = await this.bridge.registerRoot(path);
    const root: AuthorizedRoot = { id: info.id, path: info.path, kind: info.kind, authorizedAt: Date.now(), exists: true, fileCount: 0, lastScannedAt: null };
    this.store.getState().addRoot(root);
    log.info("Media root authorized", { kind: info.kind });
    return root;
  }

  async revokeRoot(rootId: string): Promise<void> {
    const root = this.store.getState().roots.find((r) => r.id === rootId);
    if (!root) return;
    try {
      await this.bridge.revokeRoot(root.path);
    } finally {
      this.store.getState().removeRoot(rootId);
      log.info("Media root authorization removed");
    }
  }

  async clearHistory(): Promise<void> {
    this.store.getState().clearHistory();
  }

  async scanRoot(rootId: string, onProgress?: (p: MediaScanProgress) => void): Promise<void> {
    await this.ensureRegistered();
    const s = this.store.getState();
    const root = s.roots.find((r) => r.id === rootId);
    if (!root) throw new Error("Unknown media root");
    const status = await this.bridge.rootStatus(root.path);
    if (!status.exists) {
      s.updateRoot(rootId, { exists: false });
      throw new ProviderOfflineError("Media", "Media source disconnected.");
    }
    s.updateRoot(rootId, { exists: true });
    const result = await this.bridge.scanRoot(root.path, (p) => {
      s.setScan(p);
      onProgress?.(p);
    });
    const now = Date.now();
    s.replaceFilesForRoot(
      rootId,
      result.files.map((f) => ({ ...f, rootId, addedAt: now })),
    );
    s.setScan(null);
    log.info("Media scan complete", { files: result.files.length, folders: result.folders, truncated: result.truncated, cancelled: result.cancelled });
  }

  async cancelScan(): Promise<void> {
    await this.bridge.cancelScan();
  }

  async setFavorite(itemId: string, favorite: boolean): Promise<void> {
    this.store.getState().setFavorite(itemId, favorite);
  }
  async createCollection(name: string): Promise<MediaCollection> {
    const c = this.store.getState().createCollection(name);
    return { id: c.id, name: c.name, itemCount: 0, itemIds: [] };
  }
  async setItemCollection(itemId: string, collectionId: string | null): Promise<void> {
    this.store.getState().setItemCollection(itemId, collectionId);
  }
  async deleteCollection(collectionId: string): Promise<void> {
    this.store.getState().deleteCollection(collectionId);
  }

  async checkAvailable(itemId: string): Promise<boolean> {
    const s = this.store.getState();
    const f = s.files.find((x) => x.id === itemId);
    if (!f) return false;
    const ok = await this.bridge.fileExists(f.path).catch(() => false);
    const set = new Set(s.unavailable);
    if (ok) set.delete(itemId);
    else set.add(itemId);
    s.setUnavailable([...set]);
    return ok;
  }

  async health(): Promise<ProviderHealth> {
    await this.ensureRegistered();
    const s = this.store.getState();
    const checkedAt = Date.now();
    if (s.roots.length === 0) return { state: "not-configured", summary: "No authorized media locations", detail: "Add a folder in Settings → Media.", checkedAt };
    const live = s.roots.filter((r) => r.exists !== false).length;
    if (live === 0) return { state: "unavailable", summary: "Media source disconnected", detail: `${s.roots.length} authorized location${s.roots.length === 1 ? "" : "s"}, none reachable.`, checkedAt };
    if (live < s.roots.length) return { state: "degraded", summary: `${live} of ${s.roots.length} locations reachable`, checkedAt };
    return { state: "available", summary: `${s.roots.length} location${s.roots.length === 1 ? "" : "s"} · ${s.files.length} files indexed`, checkedAt };
  }
}
