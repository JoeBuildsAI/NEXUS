import { describe, expect, it } from "vitest";
import { shortcutFor } from "./shortcuts";

describe("shortcuts", () => {
  it("maps loop markers, playback and navigation keys", () => {
    expect(shortcutFor({ key: " " })).toBe("toggle-play");
    expect(shortcutFor({ key: "I" })).toBe("set-a");
    expect(shortcutFor({ key: "o" })).toBe("set-b");
    expect(shortcutFor({ key: "l" })).toBe("toggle-loop");
    expect(shortcutFor({ key: "r" })).toBe("cycle-repeat");
    expect(shortcutFor({ key: "ArrowRight" })).toBe("seek-fwd");
    expect(shortcutFor({ key: "ArrowRight", shiftKey: true })).toBe("seek-fwd-long");
    expect(shortcutFor({ key: "n" })).toBe("next");
    expect(shortcutFor({ key: "Escape" })).toBe("exit-fullscreen");
  });

  it("Ctrl+O opens; other modified keys pass through", () => {
    expect(shortcutFor({ key: "o", ctrlKey: true })).toBe("open");
    expect(shortcutFor({ key: "N", ctrlKey: true })).toBe("new-window");
    expect(shortcutFor({ key: "c", ctrlKey: true })).toBeNull();
    expect(shortcutFor({ key: "i", altKey: true })).toBeNull();
    expect(shortcutFor({ key: "q" })).toBeNull();
  });
});
