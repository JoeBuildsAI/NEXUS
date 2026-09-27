import { convertFileSrc } from "@tauri-apps/api/core";
import type { MediaScanProgress, Playability } from "@/core/types";

export interface NativeRootInfo {
  id: string;
  path: string;
  kind: "fixed" | "removable" | "network" | "unknown";
  exists: boolean;
}

export interface NativeMediaFile {
  id: string;
  path: string;
  name: string;
  folder: string;
  ext: string;
  sizeBytes: number;
  modified: number;
  playability: Playability;
}

export interface NativeScanResult {
  rootId: string;
  files: NativeMediaFile[];
  folders: number;
  cancelled: boolean;
  truncated: boolean;
}

/**
 * Narrow native surface for local media. The frontend never receives generic
 * filesystem access — only these operations, scoped to authorized roots.
 */
export interface MediaBridge {
  /** Native folder picker. Returns null when cancelled. */
  pickFolder(): Promise<string | null>;
  registerRoot(path: string): Promise<NativeRootInfo>;
  revokeRoot(path: string): Promise<void>;
  rootStatus(path: string): Promise<NativeRootInfo>;
  fileExists(path: string): Promise<boolean>;
  scanRoot(path: string, onProgress: (p: MediaScanProgress) => void): Promise<NativeScanResult>;
  cancelScan(): Promise<void>;
  toAssetUrl(path: string): string;
  /** Local thumbnail (Windows Shell); returns an absolute cache path or null. */
  thumbnail(path: string, rootId: string): Promise<string | null>;
  purgeThumbnails(rootId?: string): Promise<void>;
}

export class TauriMediaBridge implements MediaBridge {
  private async invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  }
  async pickFolder(): Promise<string | null> {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const res = await open({ directory: true, multiple: false, title: "Authorize a media folder for NEXUS" });
    return typeof res === "string" ? res : null;
  }
  registerRoot(path: string) {
    return this.invoke<NativeRootInfo>("media_register_root", { path });
  }
  revokeRoot(path: string) {
    return this.invoke<void>("media_revoke_root", { path });
  }
  rootStatus(path: string) {
    return this.invoke<NativeRootInfo>("media_root_status", { path });
  }
  fileExists(path: string) {
    return this.invoke<boolean>("media_file_exists", { path });
  }
  async scanRoot(path: string, onProgress: (p: MediaScanProgress) => void): Promise<NativeScanResult> {
    const { listen } = await import("@tauri-apps/api/event");
    // Attach listeners BEFORE starting the scan: a tiny folder can complete
    // before a post-invoke listener would be registered. Events are matched
    // by rootId, which we only learn from the invoke, so buffer until then.
    let rootId: string | null = null;
    let settled = false;
    let resolveFn!: (r: NativeScanResult) => void;
    let rejectFn!: (e: Error) => void;
    const done = new Promise<NativeScanResult>((res, rej) => { resolveFn = res; rejectFn = rej; });
    const pending: NativeScanResult[] = [];
    const unProgress = await listen<MediaScanProgress>("media:scan-progress", (e) => {
      if (rootId && e.payload.rootId === rootId) onProgress(e.payload);
    });
    const unComplete = await listen<NativeScanResult>("media:scan-complete", (e) => {
      if (!rootId) { pending.push(e.payload); return; }
      if (e.payload.rootId === rootId && !settled) { settled = true; resolveFn(e.payload); }
    });
    const cleanup = () => { unProgress(); unComplete(); };
    const timer = setTimeout(() => { if (!settled) { settled = true; rejectFn(new Error("Scan timed out")); } }, 120_000);
    try {
      rootId = await this.invoke<string>("media_scan_root", { path });
      const early = pending.find((p) => p.rootId === rootId);
      if (early && !settled) { settled = true; resolveFn(early); }
      return await done;
    } catch (e) {
      if (!settled) { settled = true; rejectFn(e instanceof Error ? e : new Error(String(e))); }
      return done;
    } finally {
      clearTimeout(timer);
      cleanup();
    }
  }
  cancelScan() {
    return this.invoke<void>("media_cancel_scan");
  }
  toAssetUrl(path: string) {
    return convertFileSrc(path);
  }
  async thumbnail(path: string, rootId: string) {
    const r = await this.invoke<{ path: string | null; cached: boolean }>("media_thumbnail", { path, rootId });
    return r.path;
  }
  async purgeThumbnails(rootId?: string) {
    await this.invoke<number>("media_purge_thumbnails", { rootId: rootId ?? null });
  }
}

/** Fixture bridge: an in-memory "drive" for tests and simulated environments. */
export class FixtureMediaBridge implements MediaBridge {
  connected = true;
  registered = new Set<string>();
  constructor(
    public root: string,
    public files: NativeMediaFile[],
    public pick: string | null = root,
    public kind: NativeRootInfo["kind"] = "removable",
  ) {}
  async pickFolder() {
    return this.pick;
  }
  async registerRoot(path: string): Promise<NativeRootInfo> {
    if (!this.connected || path.toLowerCase() !== this.root.toLowerCase()) throw new Error("Folder does not exist or is not a directory.");
    this.registered.add(path);
    return { id: `root-${path.toLowerCase()}`, path, kind: this.kind, exists: true };
  }
  async revokeRoot(path: string) {
    this.registered.delete(path);
  }
  async rootStatus(path: string): Promise<NativeRootInfo> {
    return { id: `root-${path.toLowerCase()}`, path, kind: this.kind, exists: this.connected && path.toLowerCase() === this.root.toLowerCase() };
  }
  async fileExists(path: string) {
    return this.connected && this.files.some((f) => f.path === path) && this.registered.size > 0;
  }
  async scanRoot(path: string, onProgress: (p: MediaScanProgress) => void): Promise<NativeScanResult> {
    if (!this.registered.has(path)) throw new Error("Folder is not authorized.");
    if (!this.connected) throw new Error("Media source disconnected.");
    const rootId = `root-${path.toLowerCase()}`;
    // Containment: only files under the root.
    const inside = this.files.filter((f) => f.path.toLowerCase().startsWith(path.toLowerCase() + "\\"));
    onProgress({ rootId, files: inside.length, folders: 1, done: false, cancelled: false, truncated: false });
    onProgress({ rootId, files: inside.length, folders: 1, done: true, cancelled: false, truncated: false });
    return { rootId, files: inside, folders: 1, cancelled: false, truncated: false };
  }
  async cancelScan() {}
  toAssetUrl(path: string) {
    return `fixture://${path}`;
  }
  thumbs = new Map<string, string>();
  purged: string[] = [];
  async thumbnail(path: string) {
    if (!this.registered.size) throw new Error("not authorized");
    const t = ["C:", "cache", "thumbs", `${path.length}.png`].join("\\");
    this.thumbs.set(path, t);
    return t;
  }
  async purgeThumbnails(rootId?: string) {
    this.purged.push(rootId ?? "*");
    this.thumbs.clear();
  }
}
