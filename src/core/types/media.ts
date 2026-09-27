/** Local media workspace domain models. Privacy-sensitive by design. */

export interface MediaItem {
  readonly id: string;
  readonly title: string;
  readonly durationSeconds: number;
  /** Source URL/path resolvable by the player (asset://, blob:, http:). */
  readonly src: string;
  readonly thumbnailColor: string;
  readonly thumbnailUrl: string | null;
  readonly addedAt: number;
  readonly collectionId: string | null;
  readonly favorite: boolean;
  /** Marks media as private — excluded from Home/global recent activity. */
  readonly private: boolean;
}

export interface MediaCollection {
  readonly id: string;
  readonly name: string;
  readonly itemCount: number;
}

export interface AuthorizedRoot {
  readonly id: string;
  readonly path: string;
  readonly kind: "fixed" | "removable" | "network";
  readonly authorizedAt: number;
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
  readonly slots: readonly (string | null)[];
  readonly savedAt: number;
}
