import type { AuthorizedRoot, MediaCollection, MediaItem, ProviderHealth } from "@/core/types";
import { DEMO_COLLECTIONS, DEMO_MEDIA } from "@/core/demo/media";
import type { MediaProvider } from "./MediaProvider";
import { ProviderOfflineError } from "@/core/errors";
import { useDevStore } from "@/state/devStore";

export class MockMediaProvider implements MediaProvider {
  readonly id = "mock-media";
  private items: MediaItem[] = [...DEMO_MEDIA];
  private roots: AuthorizedRoot[] = [];
  private collections: MediaCollection[] = [...DEMO_COLLECTIONS];

  private guard() {
    if (!useDevStore.getState().mediaConnected) {
      throw new ProviderOfflineError("Media", "Media drive disconnected (simulated)");
    }
  }

  async getItems(): Promise<readonly MediaItem[]> {
    this.guard();
    return this.items;
  }

  async getCollections(): Promise<readonly MediaCollection[]> {
    return this.collections.map((c) => ({ ...c, itemCount: this.items.filter((i) => i.collectionId === c.id).length }));
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
      exists: true,
      fileCount: this.items.length,
      lastScannedAt: Date.now(),
    };
    this.roots = [...this.roots, root];
    return root;
  }

  async revokeRoot(rootId: string): Promise<void> {
    this.roots = this.roots.filter((r) => r.id !== rootId);
  }

  async clearHistory(): Promise<void> {
    this.items = [...DEMO_MEDIA];
    this.collections = [...DEMO_COLLECTIONS];
  }

  async setFavorite(itemId: string, favorite: boolean): Promise<void> {
    this.items = this.items.map((i) => (i.id === itemId ? { ...i, favorite } : i));
  }
  async createCollection(name: string): Promise<MediaCollection> {
    const c: MediaCollection = { id: `col-${Date.now()}`, name, itemCount: 0 };
    this.collections = [...this.collections, c];
    return c;
  }
  async setItemCollection(itemId: string, collectionId: string | null): Promise<void> {
    this.items = this.items.map((i) => (i.id === itemId ? { ...i, collectionId } : i));
  }
  async deleteCollection(collectionId: string): Promise<void> {
    this.collections = this.collections.filter((c) => c.id !== collectionId);
    this.items = this.items.map((i) => (i.collectionId === collectionId ? { ...i, collectionId: null } : i));
  }
  async checkAvailable(): Promise<boolean> {
    return useDevStore.getState().mediaConnected;
  }
  async health(): Promise<ProviderHealth> {
    const ok = useDevStore.getState().mediaConnected;
    return { state: ok ? "available" : "unavailable", summary: ok ? "Demo library" : "Disconnected (simulated)", checkedAt: Date.now() };
  }
}
