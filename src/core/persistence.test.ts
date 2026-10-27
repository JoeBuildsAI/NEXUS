import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULTS, loadDefaults, loadLastFile, loadMarkers, migrateLegacy, prunePresets, saveDefaults, saveMarkers, videoId } from "./persistence";

describe("persistence", () => {
  beforeEach(() => localStorage.clear());

  it("defaults round-trip and are sanitised", () => {
    expect(loadDefaults(localStorage)).toEqual(DEFAULTS);
    saveDefaults(localStorage, { volume: 0.4, muted: true, rate: 1.5, repeat: "all", panelOpen: false });
    expect(loadDefaults(localStorage)).toEqual({ volume: 0.4, muted: true, rate: 1.5, repeat: "all", panelOpen: false });
    localStorage.setItem("nexus.window-defaults.v1", JSON.stringify({ volume: 7, rate: "x", repeat: "always" }));
    expect(loadDefaults(localStorage)).toMatchObject({ volume: 1, rate: 1, repeat: "off" });
  });

  it("video identity is case/separator-insensitive and not the path itself", () => {
    expect(videoId("C:\\Clips\\A.mp4")).toBe(videoId("c:/clips/a.MP4"));
    expect(videoId("C:\\Clips\\A.mp4")).not.toBe(videoId("C:\\Clips\\B.mp4"));
    expect(videoId("C:\\Secret\\name.mp4")).not.toContain("secret");
  });

  it("each video's preset is an independent record: writing one never rewrites another", () => {
    saveMarkers(localStorage, "a.mp4", { a: 1, b: 3 });
    // A second window with a stale view writes a different video only.
    saveMarkers(localStorage, "b.mp4", { a: 5, b: 9 });
    expect(loadMarkers(localStorage, "a.mp4")).toEqual({ a: 1, b: 3 });
    expect(loadMarkers(localStorage, "b.mp4")).toEqual({ a: 5, b: 9 });
    saveMarkers(localStorage, "a.mp4", { a: null, b: null });
    expect(loadMarkers(localStorage, "a.mp4")).toEqual({ a: null, b: null });
    expect(loadMarkers(localStorage, "b.mp4")).toEqual({ a: 5, b: 9 });
  });

  it("presets are pruned least-recently-edited first", () => {
    for (let i = 0; i < 6; i++) saveMarkers(localStorage, `v${i}.mp4`, { a: i, b: i + 1 }, i);
    prunePresets(localStorage, 4);
    expect(loadMarkers(localStorage, "v0.mp4").a).toBeNull();
    expect(loadMarkers(localStorage, "v1.mp4").a).toBeNull();
    expect(loadMarkers(localStorage, "v5.mp4").a).toBe(5);
  });

  it("migrates the 0.6.0 single-blob store once", () => {
    localStorage.setItem("nexus-player", JSON.stringify({ state: { volume: 0.5, muted: false, rate: 2, repeat: "one", panelOpen: true, lastFile: "x.mp4", markers: { "x.mp4": { a: 2, b: 4 } } }, version: 1 }));
    migrateLegacy(localStorage);
    expect(localStorage.getItem("nexus-player")).toBeNull();
    expect(loadDefaults(localStorage)).toMatchObject({ volume: 0.5, rate: 2, repeat: "one" });
    expect(loadLastFile(localStorage)).toBe("x.mp4");
    expect(loadMarkers(localStorage, "x.mp4")).toEqual({ a: 2, b: 4 });
  });
});
