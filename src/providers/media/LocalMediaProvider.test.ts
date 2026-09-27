import { beforeEach, describe, expect, it } from "vitest";
import { LocalMediaProvider } from "./LocalMediaProvider";
import { FixtureMediaBridge, type NativeMediaFile } from "./MediaBridge";
import { useMediaLibraryStore } from "@/state/mediaLibraryStore";
import { isOffline } from "@/core/errors";

const X = "X:\\Videos";
const file = (path: string, playability: NativeMediaFile["playability"] = "playable"): NativeMediaFile => {
  const name = path.split("\\").pop()!.replace(/\.[^.]+$/, "");
  const folder = path.slice(X.length + 1).split("\\").slice(0, -1).join("\\");
  return { id: `mf-${path.toLowerCase()}`, path, name, folder, ext: path.split(".").pop()!, sizeBytes: 1000, modified: 1, playability };
};

const LIBRARY: NativeMediaFile[] = [
  file(`${X}\\a.mp4`),
  file(`${X}\\Clips\\b.mp4`),
  file(`${X}\\Clips\\Nested\\Deep\\c.webm`),
  file(`${X}\\Old\\d.mkv`, "potentially-unsupported"),
  file(`${X}\\Old\\e.avi`, "potentially-unsupported"),
  file(`${X}\\f.mov`),
  // Escape attempt: a file outside the root must never be indexed.
  file(`X:\\Private\\outside.mp4`),
];

function setup(opts: { connected?: boolean; pick?: string | null } = {}) {
  useMediaLibraryStore.setState({ roots: [], files: [], favorites: [], collections: [], scan: null, unavailable: [] });
  const bridge = new FixtureMediaBridge(X, LIBRARY, opts.pick === undefined ? X : opts.pick);
  bridge.connected = opts.connected ?? true;
  const provider = new LocalMediaProvider(bridge);
  return { bridge, provider };
}

describe("LocalMediaProvider", () => {
  beforeEach(() => useMediaLibraryStore.setState({ roots: [], files: [], favorites: [], collections: [], scan: null, unavailable: [] }));

  it("starts empty and not configured", async () => {
    const { provider } = setup();
    expect(await provider.getItems()).toEqual([]);
    expect((await provider.health()).state).toBe("not-configured");
  });

  it("authorizes a user-picked root and indexes only files inside it", async () => {
    const { provider } = setup();
    const root = await provider.authorizeRoot();
    expect(root?.path).toBe(X);
    expect(root?.kind).toBe("removable");
    const progress: number[] = [];
    await provider.scanRoot(root!.id, (p) => progress.push(p.files));
    const items = await provider.getItems();
    expect(items).toHaveLength(6);
    expect(items.some((i) => i.title === "outside")).toBe(false);
    expect(progress.length).toBeGreaterThan(0);
    expect(items.every((i) => i.private)).toBe(true);
    expect(items.every((i) => i.src.startsWith("fixture://"))).toBe(true);
  });

  it("marks unsupported containers as potentially-unsupported", async () => {
    const { provider } = setup();
    const root = await provider.authorizeRoot();
    await provider.scanRoot(root!.id);
    const items = await provider.getItems();
    expect(items.find((i) => i.ext === "mkv")?.playability).toBe("potentially-unsupported");
    expect(items.find((i) => i.ext === "mp4")?.playability).toBe("playable");
  });

  it("cancelled picker → null, nothing authorized", async () => {
    const { provider } = setup({ pick: null });
    expect(await provider.authorizeRoot()).toBeNull();
    expect(await provider.getAuthorizedRoots()).toEqual([]);
  });

  it("drive disconnected → typed offline state, index preserved", async () => {
    const { bridge, provider } = setup();
    const root = await provider.authorizeRoot();
    await provider.scanRoot(root!.id);
    bridge.connected = false;
    await expect(provider.scanRoot(root!.id)).rejects.toSatisfy((e: unknown) => isOffline(e));
    await expect(provider.getItems()).rejects.toSatisfy((e: unknown) => isOffline(e));
    expect((await provider.health()).state).toBe("unavailable");
    expect(useMediaLibraryStore.getState().files).toHaveLength(6); // preserved for reconnect
  });

  it("missing file is marked unavailable, not fatal", async () => {
    const { bridge, provider } = setup();
    const root = await provider.authorizeRoot();
    await provider.scanRoot(root!.id);
    const target = (await provider.getItems())[0]!;
    bridge.files = bridge.files.filter((f) => f.id !== target.id);
    expect(await provider.checkAvailable(target.id)).toBe(false);
    const again = (await provider.getItems()).find((i) => i.id === target.id)!;
    expect(again.available).toBe(false);
  });

  it("revoking authorization removes index, favorites and native access", async () => {
    const { bridge, provider } = setup();
    const root = await provider.authorizeRoot();
    await provider.scanRoot(root!.id);
    const first = (await provider.getItems())[0]!;
    await provider.setFavorite(first.id, true);
    await provider.revokeRoot(root!.id);
    expect(bridge.registered.size).toBe(0);
    expect(await provider.getItems()).toEqual([]);
    expect(useMediaLibraryStore.getState().favorites).toEqual([]);
    await expect(bridge.scanRoot(X, () => {})).rejects.toThrow(/not authorized/);
  });

  it("favorites and collections are local and reflected on items", async () => {
    const { provider } = setup();
    const root = await provider.authorizeRoot();
    await provider.scanRoot(root!.id);
    const [a, b] = await provider.getItems();
    await provider.setFavorite(a!.id, true);
    const col = await provider.createCollection("Concert");
    await provider.setItemCollection(b!.id, col.id);
    const items = await provider.getItems();
    expect(items.find((i) => i.id === a!.id)?.favorite).toBe(true);
    expect(items.find((i) => i.id === b!.id)?.collectionId).toBe(col.id);
    const cols = await provider.getCollections();
    expect(cols.find((c) => c.id === "favorites")?.itemCount).toBe(1);
    expect(cols.find((c) => c.id === col.id)?.itemCount).toBe(1);
  });

  it("clear history wipes index but keeps authorization", async () => {
    const { provider } = setup();
    const root = await provider.authorizeRoot();
    await provider.scanRoot(root!.id);
    await provider.clearHistory();
    expect(await provider.getItems()).toEqual([]);
    expect(await provider.getAuthorizedRoots()).toHaveLength(1);
  });
});
