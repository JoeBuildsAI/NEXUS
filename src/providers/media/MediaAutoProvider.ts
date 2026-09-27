import type { AuthorizedRoot, MediaCollection, MediaItem, MediaScanProgress, ProviderHealth } from "@/core/types";
import type { MediaProvider } from "./MediaProvider";
import type { LocalMediaProvider } from "./LocalMediaProvider";
import type { MockMediaProvider } from "./MockMediaProvider";
import { useMediaLibraryStore } from "@/state/mediaLibraryStore";

/**
 * Real-first media provider. Once the user has authorized at least one folder
 * the real LocalMediaProvider is used exclusively; before that, demo mode may
 * serve the sample library so the workspace is demonstrable.
 */
export class MediaAutoProvider implements MediaProvider {
  readonly id = "auto-media";
  constructor(private local: LocalMediaProvider, private mock: MockMediaProvider, private allowDemoFallback: boolean) {}

  private pick(): MediaProvider {
    const hasRoots = useMediaLibraryStore.getState().roots.length > 0;
    return hasRoots || !this.allowDemoFallback ? this.local : this.mock;
  }
  mode(): "real" | "demo" {
    return this.pick() === this.local ? "real" : "demo";
  }

  getItems(): Promise<readonly MediaItem[]> {
    return this.pick().getItems();
  }
  getCollections(): Promise<readonly MediaCollection[]> {
    return this.pick().getCollections();
  }
  getAuthorizedRoots(): Promise<readonly AuthorizedRoot[]> {
    return this.local.getAuthorizedRoots();
  }
  /** Authorizing always goes to the real provider (that's how you leave demo). */
  authorizeRoot(): Promise<AuthorizedRoot | null> {
    return this.local.authorizeRoot();
  }
  revokeRoot(rootId: string): Promise<void> {
    return this.local.revokeRoot(rootId);
  }
  async clearHistory(): Promise<void> {
    await this.local.clearHistory();
    await this.mock.clearHistory();
  }
  scanRoot(rootId: string, onProgress?: (p: MediaScanProgress) => void): Promise<void> {
    return this.local.scanRoot(rootId, onProgress);
  }
  cancelScan(): Promise<void> {
    return this.local.cancelScan();
  }
  setFavorite(itemId: string, favorite: boolean): Promise<void> {
    return this.pick().setFavorite?.(itemId, favorite) ?? Promise.resolve();
  }
  createCollection(name: string): Promise<MediaCollection> {
    return this.pick().createCollection!(name);
  }
  setItemCollection(itemId: string, collectionId: string | null): Promise<void> {
    return this.pick().setItemCollection?.(itemId, collectionId) ?? Promise.resolve();
  }
  deleteCollection(collectionId: string): Promise<void> {
    return this.pick().deleteCollection?.(collectionId) ?? Promise.resolve();
  }
  checkAvailable(itemId: string): Promise<boolean> {
    return this.pick().checkAvailable?.(itemId) ?? Promise.resolve(true);
  }
  ensureThumbnail(itemId: string): Promise<string | null> {
    return this.pick() === this.local ? this.local.ensureThumbnail(itemId) : Promise.resolve(null);
  }
  purgeThumbnails(): Promise<void> {
    return this.local.purgeThumbnails();
  }
  async health(): Promise<ProviderHealth> {
    const h = await this.local.health!();
    if (h.state === "not-configured" && this.allowDemoFallback) return { ...h, summary: "No authorized locations · using demo library" };
    return h;
  }
}
