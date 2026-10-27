import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/core/native", () => ({
  native: {
    openVideo: vi.fn(async (path: string) => ({
      folder: "F:\\clips",
      folderName: "clips",
      current: path,
      videos: [
        { path: "F:\\clips\\a.mp4", name: "a", ext: "mp4", sizeBytes: 1, modified: 0, playable: true },
        { path: "F:\\clips\\b.mp4", name: "b", ext: "mp4", sizeBytes: 1, modified: 0, playable: true },
      ],
      truncated: false,
    })),
    openFolder: vi.fn(async () => { throw new Error("That folder could not be found."); }),
  },
}));

import { markersOf, usePlayer } from "./player";

describe("player store", () => {
  beforeEach(() => {
    usePlayer.setState({ listing: null, current: null, error: null, markers: {}, loopAB: false, volume: 1, muted: false, rate: 1 });
  });

  it("opening a file lists its folder and selects it", async () => {
    expect(await usePlayer.getState().openFile("F:\\clips\\b.mp4")).toBe(true);
    const s = usePlayer.getState();
    expect(s.current).toBe("F:\\clips\\b.mp4");
    expect(s.listing?.videos).toHaveLength(2);
    expect(s.lastFile).toBe("F:\\clips\\b.mp4");
  });

  it("errors surface as a message instead of throwing", async () => {
    expect(await usePlayer.getState().openFolder("nope")).toBe(false);
    expect(usePlayer.getState().error).toMatch(/could not be found/);
  });

  it("A–B markers are remembered per video and clearing disengages the loop", () => {
    const s = usePlayer.getState();
    s.select("a.mp4");
    s.setMarker("a", 1.5);
    s.setMarker("b", 4);
    s.setLoopAB(true);
    s.select("b.mp4");
    expect(markersOf(usePlayer.getState())).toEqual({ a: null, b: null });
    s.select("a.mp4");
    expect(markersOf(usePlayer.getState())).toEqual({ a: 1.5, b: 4 });
    s.clearMarkers();
    expect(markersOf(usePlayer.getState())).toEqual({ a: null, b: null });
    expect(usePlayer.getState().loopAB).toBe(false);
  });

  it("remembered markers stay bounded", () => {
    const s = usePlayer.getState();
    for (let i = 0; i < 520; i++) {
      s.select(`v${i}.mp4`);
      s.setMarker("a", 1);
    }
    const m = usePlayer.getState().markers;
    expect(Object.keys(m)).toHaveLength(500);
    expect(m["v519.mp4"]).toBeDefined();
    expect(m["v0.mp4"]).toBeUndefined();
  });

  it("volume and speed are clamped", () => {
    const s = usePlayer.getState();
    s.setVolume(1.4);
    expect(usePlayer.getState().volume).toBe(1);
    s.setVolume(-1);
    expect(usePlayer.getState()).toMatchObject({ volume: 0, muted: true });
    s.setRate(9);
    expect(usePlayer.getState().rate).toBe(4);
    s.setRate(0.1);
    expect(usePlayer.getState().rate).toBe(0.25);
  });
});
