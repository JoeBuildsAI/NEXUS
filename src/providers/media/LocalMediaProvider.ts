import type { AuthorizedRoot, MediaCollection, MediaItem } from "@/core/types";
import type { MediaProvider } from "./MediaProvider";

/**
 * LocalMediaProvider — reads media from user-authorized folders via Tauri.
 *
 * Documented stub for the dev laptop. On the gaming PC this will:
 *  1. Use the Tauri dialog plugin to let the user pick a folder (explicit auth).
 *  2. Detect whether the chosen root is on a removable drive and record that;
 *     removable roots are opt-in and excluded from any cleanup operation.
 *  3. Enumerate video files via a Rust command scoped strictly to the authorized
 *     root — never a whole-drive scan.
 *  4. Serve files to the <video> element via the Tauri asset protocol.
 *  5. Persist the index locally (SQLite) with private-by-default flags.
 *
 * See docs/GAMING_PC_SETUP.md.
 */
export class LocalMediaProvider implements MediaProvider {
  readonly id = "local-media";

  private notImplemented(method: string): never {
    throw new Error(
      `LocalMediaProvider.${method}() is not implemented yet. ` +
        `Set VITE_PROVIDER_MEDIA=mock during development.`,
    );
  }

  async getItems(): Promise<readonly MediaItem[]> {
    this.notImplemented("getItems");
  }
  async getCollections(): Promise<readonly MediaCollection[]> {
    this.notImplemented("getCollections");
  }
  async getAuthorizedRoots(): Promise<readonly AuthorizedRoot[]> {
    this.notImplemented("getAuthorizedRoots");
  }
  async authorizeRoot(): Promise<AuthorizedRoot | null> {
    this.notImplemented("authorizeRoot");
  }
  async revokeRoot(_rootId: string): Promise<void> {
    this.notImplemented("revokeRoot");
  }
  async clearHistory(): Promise<void> {
    this.notImplemented("clearHistory");
  }
}
