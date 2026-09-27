import type { AuthorizedRoot, MediaCollection, MediaItem, ProviderHealth } from "@/core/types";
import { DEMO_COLLECTIONS, DEMO_MEDIA } from "@/core/demo/media";
import type { MediaProvider } from "./MediaProvider";
import { ProviderOfflineError } from "@/core/errors";
import { useDevStore } from "@/state/devStore";
import { syntheticMedia } from "@/core/demo/synthetic";
import { FIXTURE_VIDEOS, fixtureUrl, fixturesAvailable } from "@/core/demo/fixtures";

export class MockMediaProvider implements MediaProvider {
  readonly id = "mock-media";
  private items: MediaItem[] = [...DEMO_MEDIA];
  private syntheticKey = "";
  private roots: AuthorizedRoot[] = [];
  private collections: MediaCollection[] = [...DEMO_COLLECTIONS];

  private guard() {
    const dev = useDevStore.getState();
    if (!dev.mediaConnected) {
      throw new ProviderOfflineError("Media", "Media drive disconnected (simulated)");
    }
    if (dev.providerExceptions) {
      throw new Error("Simulated provider exception: media");
    }
  }

  /** Dev lab: extend the demo set with synthetic items when requested. */
  private ensureSynthetic() {
    const dev = useDevStore.getState();
    const key = `${dev.mediaLibrarySize}:${dev.extremeText}`;
    if (key === this.syntheticKey) return;
    this.syntheticKey = key;
    const keep = this.items.filter((i) => !i.id.startsWith("synm-"));
    this.items = dev.mediaLibrarySize || dev.extremeText ? [...keep, ...syntheticMedia(dev.mediaLibrarySize || 9, dev.extremeText)] : keep;
  }

  async getItems(): Promise<readonly MediaItem[]> {
    this.guard();
    this.ensureSynthetic();
    if (useDevStore.getState().syntheticVideos && fixturesAvailable()) {
      // Dev lab: the first items become playable local fixture videos with real aspect ratios.
      return this.items.map((item, i) => {
        const f = FIXTURE_VIDEOS[i];
        return f ? { ...item, src: fixtureUrl(f.name), durationSeconds: f.seconds, ext: "webm", playability: "playable" as const, available: true } : item;
      });
    }
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
