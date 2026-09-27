import type { AuthorizedRoot, MediaCollection, MediaItem, MediaScanProgress, ProviderHealth } from "@/core/types";

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
  /** Clear all locally stored media history/index (authorizations remain). */
  clearHistory(): Promise<void>;

  // ---- library management (all local) ----
  scanRoot?(rootId: string, onProgress?: (p: MediaScanProgress) => void): Promise<void>;
  cancelScan?(): Promise<void>;
  setFavorite?(itemId: string, favorite: boolean): Promise<void>;
  createCollection?(name: string): Promise<MediaCollection>;
  setItemCollection?(itemId: string, collectionId: string | null): Promise<void>;
  deleteCollection?(collectionId: string): Promise<void>;
  /** Re-check that an item's file still exists (drive connected). */
  checkAvailable?(itemId: string): Promise<boolean>;
  health?(): Promise<ProviderHealth>;
}
