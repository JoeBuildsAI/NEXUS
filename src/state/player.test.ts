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

import { loadDefaults, loadLastFile, loadMarkers } from "@/core/persistence";

/** A fresh store module = a fresh NEXUS window (each window is its own document). */
async function newWindow() {
  vi.resetModules();
  return (await import("./player")).usePlayer;
}

describe("player store (one window)", () => {
  beforeEach(() => localStorage.clear());

  it("opening a file lists its folder, selects it and records it as last file", async () => {
    const usePlayer = await newWindow();
    expect(await usePlayer.getState().openFile("F:\\clips\\b.mp4")).toBe(true);
    const s = usePlayer.getState();
    expect(s.current).toBe("F:\\clips\\b.mp4");
    expect(s.listing?.videos).toHaveLength(2);
    expect(loadLastFile(localStorage)).toBe("F:\\clips\\b.mp4");
  });

  it("errors surface as a message instead of throwing", async () => {
    const usePlayer = await newWindow();
    expect(await usePlayer.getState().openFolder("nope")).toBe(false);
    expect(usePlayer.getState().error).toMatch(/could not be found/);
  });

  it("A–B markers are saved per video and reloaded when switching back", async () => {
    const usePlayer = await newWindow();
    const s = usePlayer.getState();
    s.select("a.mp4");
    s.setMarker("a", 1.5);
    s.setMarker("b", 4);
    s.setLoopAB(true);
    s.select("b.mp4");
    expect(usePlayer.getState().markers).toEqual({ a: null, b: null });
    expect(usePlayer.getState().loopAB).toBe(false);
    s.select("a.mp4");
    expect(usePlayer.getState().markers).toEqual({ a: 1.5, b: 4 });
    s.clearMarkers();
    expect(loadMarkers(localStorage, "a.mp4")).toEqual({ a: null, b: null });
  });

  it("volume and speed are clamped", async () => {
    const usePlayer = await newWindow();
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

describe("player store (several windows)", () => {
  beforeEach(() => localStorage.clear());

  it("windows never change each other's playback state", async () => {
    const w1 = await newWindow();
    const w2 = await newWindow();
    expect(w1).not.toBe(w2);
    w1.getState().select("a.mp4");
    w2.getState().select("b.mp4");
    w1.getState().setVolume(0.2);
    w1.getState().setRate(2);
    w1.getState().cycleRepeat();
    w2.getState().togglePanel();
    w1.getState().setMarker("a", 1);
    w1.getState().setMarker("b", 3);
    w1.getState().setLoopAB(true);

    expect(w2.getState()).toMatchObject({ current: "b.mp4", volume: 1, rate: 1, repeat: "off", loopAB: false, markers: { a: null, b: null } });
    expect(w1.getState()).toMatchObject({ current: "a.mp4", volume: 0.2, rate: 2, repeat: "one", panelOpen: true, loopAB: true });
  });

  it("the same video in two windows can loop different segments; the preset is the last one saved", async () => {
    const w1 = await newWindow();
    const w2 = await newWindow();
    w1.getState().select("same.mp4");
    w2.getState().select("same.mp4");
    w1.getState().setMarker("a", 1);
    w1.getState().setMarker("b", 2);
    w2.getState().setMarker("a", 10);
    w2.getState().setMarker("b", 20);
    expect(w1.getState().markers).toEqual({ a: 1, b: 2 });
    expect(w2.getState().markers).toEqual({ a: 10, b: 20 });
    expect(loadMarkers(localStorage, "same.mp4")).toEqual({ a: 10, b: 20 });
  });

  it("a window's preferences seed the next window without touching open ones", async () => {
    const w1 = await newWindow();
    const w2 = await newWindow();
    w1.getState().setVolume(0.3);
    expect(w2.getState().volume).toBe(1);
    expect(loadDefaults(localStorage).volume).toBe(0.3);
    const w3 = await newWindow();
    expect(w3.getState().volume).toBe(0.3);
  });
});
