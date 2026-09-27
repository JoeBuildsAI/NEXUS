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

/** State for a single slot in the six-player workspace. */
export interface PlayerSlot {
  readonly index: number;
  readonly itemId: string | null;
  readonly playing: boolean;
  readonly muted: boolean;
  readonly volume: number;
}

export interface WorkspaceLayout {
  readonly id: string;
  readonly name: string;
  readonly columns: number;
  readonly rows: number;
  /** Layout preset id (e.g. "3x2", "focus"). Optional for older saves. */
  readonly layout?: string;
  readonly slots: readonly (string | null)[];
  readonly savedAt: number;
}
