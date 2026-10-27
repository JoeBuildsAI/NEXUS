import { describe, expect, it } from "vitest";
import { neighbor, nextRepeat, onEnded, type PlaylistItem } from "./playlist";

const items: PlaylistItem[] = [
  { path: "a.mp4", playable: true },
  { path: "b.mkv", playable: false },
  { path: "c.mp4", playable: true },
  { path: "d.mp4", playable: true },
];

describe("playlist", () => {
  it("cycles repeat modes off → one → all → off", () => {
    expect(nextRepeat("off")).toBe("one");
    expect(nextRepeat("one")).toBe("all");
    expect(nextRepeat("all")).toBe("off");
  });

  it("steps through playable videos only, wrapping only when asked", () => {
    expect(neighbor(items, "a.mp4", 1, false)).toBe("c.mp4");
    expect(neighbor(items, "c.mp4", -1, false)).toBe("a.mp4");
    expect(neighbor(items, "d.mp4", 1, false)).toBeNull();
    expect(neighbor(items, "d.mp4", 1, true)).toBe("a.mp4");
    expect(neighbor(items, "a.mp4", -1, true)).toBe("d.mp4");
    expect(neighbor(items, null, 1, false)).toBe("a.mp4");
    expect(neighbor([], "a.mp4", 1, true)).toBeNull();
  });

  it("end of video: repeat one replays, repeat all advances and wraps, off stops", () => {
    expect(onEnded("one", items, "c.mp4")).toEqual({ kind: "replay" });
    expect(onEnded("all", items, "c.mp4")).toEqual({ kind: "play", path: "d.mp4" });
    expect(onEnded("all", items, "d.mp4")).toEqual({ kind: "play", path: "a.mp4" });
    expect(onEnded("all", [{ path: "a.mp4", playable: true }], "a.mp4")).toEqual({ kind: "replay" });
    expect(onEnded("off", items, "c.mp4")).toEqual({ kind: "stop" });
  });
});
