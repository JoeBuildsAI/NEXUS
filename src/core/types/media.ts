/** Local media workspace domain models. Privacy-sensitive by design. */

export type Playability = "playable" | "potentially-unsupported";

export interface MediaItem {
  readonly id: string;
  readonly title: string;
  readonly durationSeconds: number;
  /** Source URL resolvable by the player (asset://, blob:, http:). */
  readonly src: string;
  readonly thumbnailColor: string;
  readonly thumbnailUrl: string | null;
  readonly addedAt: number;
  readonly collectionId: string | null;
  readonly favorite: boolean;
  /** Marks media as private — excluded from Home/global recent activity. */
  readonly private: boolean;
  /** Real-media fields (absent for demo items). */
  readonly rootId?: string;
  readonly folder?: string;
  readonly ext?: string;
  readonly sizeBytes?: number;
  readonly playability?: Playability;
  /** False when the backing file/drive is currently unavailable. */
  readonly available?: boolean;
}

export interface MediaCollection {
  readonly id: string;
  readonly name: string;
  readonly itemCount: number;
  readonly itemIds?: readonly string[];
}

export interface AuthorizedRoot {
  readonly id: string;
  readonly path: string;
  readonly kind: "fixed" | "removable" | "network" | "unknown";
  readonly authorizedAt: number;
  /** Whether the folder is currently reachable (drive connected). */
  readonly exists?: boolean;
  readonly fileCount?: number;
  readonly lastScannedAt?: number | null;
}

export interface MediaScanProgress {
  readonly rootId: string;
  readonly files: number;
  readonly folders: number;
  readonly done: boolean;
  readonly cancelled: boolean;
  readonly truncated: boolean;
}

export type FitMode = "fit" | "fill" | "smart";
export type LoopMode = "off" | "full" | "ab";

/** State for a single player on the adaptive wall (up to 6). */
/** A non-video surface on the wall (isolated, untrusted web page). */
export interface BrowserSurface {
  readonly url: string;
  /** User-adjustable display aspect (pages expose none). */
  readonly aspect: number;
}

export interface PlayerSlot {
  readonly index: number;
  readonly itemId: string | null;
  /** When set (and itemId is null) the slot is a BROWSER surface. */
  readonly browser?: BrowserSurface | null;
  readonly playing: boolean;
  readonly muted: boolean;
  readonly volume: number;
  /** null = inherit the workspace default. */
  readonly fit: FitMode | null;
  readonly loop: LoopMode;
  readonly loopA: number | null;
  readonly loopB: number | null;
  readonly rate: number;
}

/** Per-player state captured in a saved workspace. */
export interface SavedPlayer {
  readonly itemId: string;
  readonly fit: FitMode | null;
  readonly loop: LoopMode;
  readonly loopA: number | null;
  readonly loopB: number | null;
  readonly volume: number;
  readonly muted: boolean;
  readonly rate: number;
  /** Optional resume position (only when the user enabled position restore). */
  readonly position?: number | null;
}

export interface WorkspaceLayout {
  readonly id: string;
  readonly name: string;
  readonly columns: number;
  readonly rows: number;
  /** Layout preset id (legacy "3x2"…; v3 uses wall modes "auto" | "grid" | "primary" | "focus"). */
  readonly layout?: string;
  readonly slots: readonly (string | null)[];
  readonly savedAt: number;
  /** v3: full per-player state and the primary player. */
  readonly players?: readonly SavedPlayer[];
  readonly primaryIndex?: number | null;
}

/** A saved A–B segment for one file. Keyed by the file's hashed id; purged with its root. */
export interface LoopPreset {
  readonly id: string;
  readonly itemId: string;
  readonly rootId: string | null;
  readonly name: string;
  readonly a: number;
  readonly b: number;
  readonly createdAt: number;
}
