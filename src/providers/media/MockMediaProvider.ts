import type { AuthorizedRoot, MediaCollection, MediaItem } from "@/core/types";
import { DEMO_COLLECTIONS, DEMO_MEDIA } from "@/core/demo/media";
import type { MediaProvider } from "./MediaProvider";
import { ProviderOfflineError } from "@/core/errors";
import { useDevStore } from "@/state/devStore";

export class MockMediaProvider implements MediaProvider {
  readonly id = "mock-media";
  private items: MediaItem[] = [...DEMO_MEDIA];
  private roots: AuthorizedRoot[] = [];

  async getItems(): Promise<readonly MediaItem[]> {
    if (!useDevStore.getState().mediaConnected) {
      throw new ProviderOfflineError("Media", "Media drive disconnected (simulated)");
    }
    return this.items;
  }

  async getCollections(): Promise<readonly MediaCollection[]> {
    return DEMO_COLLECTIONS;
  }

  async getAuthorizedRoots(): Promise<readonly AuthorizedRoot[]> {
    return this.roots;
  }

  async authorizeRoot(): Promise<AuthorizedRoot | null> {
    // Simulate a user authorizing a demo folder.
    const root: AuthorizedRoot = {
      id: `root-${Date.now()}`,
      path: "C:\\Users\\Joseph\\Videos\\Demo",
      kind: "fixed",
      authorizedAt: Date.now(),
    };
    this.roots = [...this.roots, root];
    return root;
  }

  async revokeRoot(rootId: string): Promise<void> {
    this.roots = this.roots.filter((r) => r.id !== rootId);
  }

  async clearHistory(): Promise<void> {
    this.items = [...DEMO_MEDIA];
  }
}
