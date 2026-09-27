import { beforeEach, describe, expect, it } from "vitest";
import { useMediaStore } from "./mediaStore";

describe("media workspace store", () => {
  beforeEach(() => useMediaStore.getState().clearPrivateWorkspace());

  it("adds to the first free player with workspace defaults and refuses a seventh", () => {
    const s = useMediaStore.getState();
    s.setDefaults({ mutedOnLoad: true, autoplay: false, loop: "full" });
    const ids = ["a", "b", "c", "d", "e", "f"].map((id) => s.addToWall(id));
    expect(ids).toEqual([0, 1, 2, 3, 4, 5]);
    expect(useMediaStore.getState().addToWall("g")).toBeNull();
    const first = useMediaStore.getState().slots[0]!;
    expect(first).toMatchObject({ itemId: "a", muted: true, playing: false, loop: "full", fit: null, rate: 1 });
  });

  it("A–B points validate against the duration and engage A–B only when both exist", () => {
    const s = useMediaStore.getState();
    s.addToWall("x");
    expect(s.setLoopPoint(0, "a", 495, 1200)).toBeNull();
    expect(useMediaStore.getState().slots[0]!.loop).toBe("full"); // one point → not yet A–B
    expect(s.setLoopPoint(0, "b", 735, 1200)).toBeNull();
    expect(useMediaStore.getState().slots[0]).toMatchObject({ loop: "ab", loopA: 495, loopB: 735 });
    expect(s.setLoopPoint(0, "b", 1300, 1200)).toBe("b-out-of-range");
    expect(s.setSegment(0, 10, 10.2, 1200)).toBe("too-short");
    s.clearSegment(0);
    expect(useMediaStore.getState().slots[0]).toMatchObject({ loop: "full", loopA: null, loopB: null });
    s.setSlotLoop(0, "ab"); // no segment → ignored
    expect(useMediaStore.getState().slots[0]!.loop).toBe("full");
  });

  it("master loop/mute actions never destroy per-player segments", () => {
    const s = useMediaStore.getState();
    s.addToWall("x");
    s.addToWall("y");
    s.setSegment(0, 2, 8, 20);
    s.muteAll(true);
    s.pauseAll();
    s.playAll();
    s.syncStart();
    expect(useMediaStore.getState().slots[0]).toMatchObject({ loop: "ab", loopA: 2, loopB: 8 });
  });

  it("focus can pause the others (opt-in) and exiting focus never restarts them", () => {
    const s = useMediaStore.getState();
    s.addToWall("x", { play: true });
    s.addToWall("y", { play: true });
    s.setActiveIndex(1);
    s.setDefaults({ focusPausesOthers: true });
    s.setMode("focus");
    const st = useMediaStore.getState();
    expect(st.focusIndex).toBe(1);
    expect(st.slots[0]!.playing).toBe(false);
    expect(st.slots[1]!.playing).toBe(true);
    s.setMode("auto");
    expect(useMediaStore.getState().slots[0]!.playing).toBe(false);
  });

  it("saved workspaces capture fit/loop/A–B/volume/primary and restore paused", () => {
    const s = useMediaStore.getState();
    s.addToWall("x", { play: true, primary: true });
    s.setSlotFit(0, "fill");
    s.setSlotVolume(0, 0.3);
    s.setSegment(0, 1, 5, 10);
    s.saveWorkspace("Test", { 0: 3.5 });
    s.clearAll();
    expect(useMediaStore.getState().slots.some((sl) => sl.itemId)).toBe(false);
    const saved = useMediaStore.getState().savedLayouts.at(-1)!;
    expect(saved.players?.[0]).toMatchObject({ itemId: "x", fit: "fill", loop: "ab", loopA: 1, loopB: 5, volume: 0.3, position: 3.5 });
    s.restoreLayout(saved.id);
    const r = useMediaStore.getState();
    expect(r.slots[0]).toMatchObject({ itemId: "x", fit: "fill", loop: "ab", loopA: 1, loopB: 5, volume: 0.3, playing: false, muted: true });
    expect(r.primaryIndex).toBe(0);
  });

  it("clear private workspace forgets remembered positions and volumes", () => {
    const s = useMediaStore.getState();
    s.addToWall("x");
    s.setSlotVolume(0, 0.1);
    s.setDefaults({ restorePosition: true });
    s.rememberPosition("x", 42);
    expect(useMediaStore.getState().lastVolume.x).toBe(0.1);
    expect(useMediaStore.getState().lastPosition.x).toBe(42);
    s.clearPrivateWorkspace();
    expect(useMediaStore.getState().lastVolume).toEqual({});
    expect(useMediaStore.getState().lastPosition).toEqual({});
    expect(useMediaStore.getState().slots.every((sl) => !sl.itemId)).toBe(true);
  });
});

describe("browser surfaces", () => {
  it("share the wall with videos, keep their own aspect, and are cleared like players", () => {
    useMediaStore.getState().clearPrivateWorkspace();
    const s = useMediaStore.getState();
    s.addToWall("v1");
    const idx = s.addBrowser("https://example.com/");
    expect(idx).toBe(1);
    expect(useMediaStore.getState().slots[1]).toMatchObject({ itemId: null, browser: { url: "https://example.com/", aspect: 16 / 9 } });
    s.setBrowserAspect(1, 9 / 16);
    s.setBrowserUrl(1, "https://example.org/");
    expect(useMediaStore.getState().slots[1]!.browser).toEqual({ url: "https://example.org/", aspect: 9 / 16 });
    // occupied slots are skipped for both kinds
    for (let i = 0; i < 4; i++) s.addBrowser("https://a.example/");
    expect(useMediaStore.getState().addBrowser("https://b.example/")).toBeNull();
    expect(useMediaStore.getState().addToWall("v2")).toBeNull();
    s.clearSlot(1);
    expect(useMediaStore.getState().slots[1]!.browser ?? null).toBeNull();
    s.clearAll();
    expect(useMediaStore.getState().slots.every((sl) => !sl.itemId && !sl.browser)).toBe(true);
  });
});
