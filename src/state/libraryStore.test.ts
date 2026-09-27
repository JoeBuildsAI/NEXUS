import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLibraryStore } from "./libraryStore";
import { __resetProviders, getProviders } from "@/providers";
import { DEMO_GAMES } from "@/core/demo/games";

describe("libraryStore", () => {
  beforeEach(() => {
    __resetProviders();
    useLibraryStore.setState({ games: [], details: {}, inflight: [], loadedAt: null, loading: false, offline: false, mode: "demo" });
  });

  it("loads the game list once and renders bare details until fetched", async () => {
    await useLibraryStore.getState().load();
    const s = useLibraryStore.getState();
    expect(s.games).toHaveLength(DEMO_GAMES.length);
    expect(s.withDetails()[0]?.achievements.total).toBe(0);
    expect(s.withDetails()[0]?.achievements.status).toBe("not-configured");
  });

  it("fetches details only for requested ids, deduplicating concurrent requests", async () => {
    await useLibraryStore.getState().load();
    const steam = getProviders().steam;
    const spy = vi.spyOn(steam, "getGameDetails");
    const id = DEMO_GAMES[0]!.id;
    await Promise.all([useLibraryStore.getState().ensureDetails([id]), useLibraryStore.getState().ensureDetails([id])]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(useLibraryStore.getState().detailsOf(id)?.achievements.total).toBeGreaterThan(0);
    // Fresh cache → no refetch
    await useLibraryStore.getState().ensureDetails([id]);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("does not fetch the whole library when only a few ids are requested", async () => {
    await useLibraryStore.getState().load();
    const spy = vi.spyOn(getProviders().steam, "getGameDetails");
    await useLibraryStore.getState().ensureDetails(DEMO_GAMES.slice(0, 2).map((g) => g.id));
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it("trims the detail cache to its ceiling (LRU by fetch time)", () => {
    const s = useLibraryStore.getState();
    for (let i = 0; i < 405; i++) {
      s.setDetails(`g-${i}`, { ...DEMO_GAMES[0]!, id: `g-${i}` });
    }
    const keys = Object.keys(useLibraryStore.getState().details);
    expect(keys.length).toBe(400);
    expect(keys).not.toContain("g-0");
    expect(keys).toContain("g-404");
  });

  it("marks the library offline when the provider throws a typed offline error", async () => {
    const { useDevStore } = await import("./devStore");
    useDevStore.getState().set({ steamConnected: false });
    await useLibraryStore.getState().load({ force: true });
    expect(useLibraryStore.getState().offline).toBe(true);
    useDevStore.getState().set({ steamConnected: true });
  });
});
