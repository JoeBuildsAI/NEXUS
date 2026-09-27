import type { AuthorizedRoot, MediaCollection, MediaItem } from "@/core/types";

/**
 * Abstraction over a LOCAL media library.
 *
 * PRIVACY & SAFETY:
 *  - Never auto-scan drives. A media root must be explicitly authorized.
 *  - Removable drives require explicit opt-in and are never touched by cleanup.
 *  - Media metadata/indexing stays local; filenames must not leak into Home or
 *    global recent activity for items marked private.
 */
export interface MediaProvider {
  readonly id: string;
  getItems(): Promise<readonly MediaItem[]>;
  getCollections(): Promise<readonly MediaCollection[]>;
  getAuthorizedRoots(): Promise<readonly AuthorizedRoot[]>;
  /**
   * Prompt the user to authorize a media root folder. Returns the new root, or
   * null if the user cancelled. Implementations must require explicit selection.
   */
  authorizeRoot(): Promise<AuthorizedRoot | null>;
  revokeRoot(rootId: string): Promise<void>;
  /** Clear all locally stored media history/index. */
  clearHistory(): Promise<void>;
}
