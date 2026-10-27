/**
 * The only door to the native layer. Every call is a validated command; the
 * WebView can read only the folder the user opened (and the thumbnail cache).
 */

export interface VideoEntry {
  path: string;
  name: string;
  ext: string;
  sizeBytes: number;
  modified: number;
  playable: boolean;
}

export interface FolderListing {
  folder: string;
  folderName: string;
  current: string | null;
  videos: VideoEntry[];
  truncated: boolean;
}

export const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const VIDEO_EXTENSIONS = ["mp4", "m4v", "webm", "mov", "ogv", "mkv", "avi", "wmv", "ts", "mpg", "mpeg", "flv"];

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export const native = {
  openVideo: (path: string) => invoke<FolderListing>("open_video", { path }),
  openFolder: (path: string) => invoke<FolderListing>("open_folder", { path }),
  refreshFolder: (folder: string) => invoke<FolderListing>("refresh_folder", { folder }),
  /** The file this window was opened for (Explorer, Open with, new window), claimed once. */
  takeInitialFile: () => (isDesktop ? invoke<string | null>("take_initial_file") : Promise.resolve(null)),
  /** A new independent player window, optionally opening `file`. */
  newWindow: (file?: string) => (isDesktop ? invoke<string>("new_window", { file: file ?? null }) : Promise.resolve("")),
  thumbnail: (path: string) => invoke<string | null>("video_thumbnail", { path }),
  clearThumbnails: () => invoke<number>("clear_thumbnails"),

  /** Asset-protocol URL for a local file (only readable inside granted folders). */
  async assetUrl(path: string): Promise<string> {
    const { convertFileSrc } = await import("@tauri-apps/api/core");
    return convertFileSrc(path);
  },

  async pickVideo(): Promise<string | null> {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const r = await open({ multiple: false, directory: false, filters: [{ name: "Videos", extensions: VIDEO_EXTENSIONS }] });
    return typeof r === "string" ? r : null;
  },

  async pickFolder(): Promise<string | null> {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const r = await open({ multiple: false, directory: true });
    return typeof r === "string" ? r : null;
  },

  async window() {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow();
  },
};
