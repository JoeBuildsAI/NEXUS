import { describe, expect, it } from "vitest";
import { matchesAccelerator, parseAccelerator, PRIVACY_HOTKEY_CHOICES } from "./hotkeys";

const ev = (init: Partial<KeyboardEvent>) => ({ ctrlKey: false, shiftKey: false, altKey: false, code: "", ...init }) as KeyboardEvent;

describe("accelerators", () => {
  it("parses Tauri accelerator syntax into modifier + code", () => {
    expect(parseAccelerator("CommandOrControl+Shift+`")).toMatchObject({ ctrl: true, shift: true, alt: false, code: "Backquote", label: "Ctrl + Shift + `" });
    expect(parseAccelerator("Alt+Shift+P")).toMatchObject({ ctrl: false, shift: true, alt: true, code: "KeyP" });
    expect(parseAccelerator("F9")).toMatchObject({ ctrl: false, code: "F9" });
  });

  it("refuses accelerators that would hijack typing", () => {
    expect(parseAccelerator("P")).toBeNull();
    expect(parseAccelerator("Shift+`")).toBeNull();
    expect(parseAccelerator("")).toBeNull();
    expect(parseAccelerator("Ctrl+Meta")).toBeNull();
  });

  it("matches keyboard events exactly (no extra modifiers)", () => {
    const p = parseAccelerator("CommandOrControl+Shift+`")!;
    expect(matchesAccelerator(ev({ ctrlKey: true, shiftKey: true, code: "Backquote" }), p)).toBe(true);
    expect(matchesAccelerator(ev({ ctrlKey: true, shiftKey: true, altKey: true, code: "Backquote" }), p)).toBe(false);
    expect(matchesAccelerator(ev({ ctrlKey: true, code: "Backquote" }), p)).toBe(false);
  });

  it("every curated choice is parseable", () => {
    expect(PRIVACY_HOTKEY_CHOICES.length).toBeGreaterThan(3);
    for (const c of PRIVACY_HOTKEY_CHOICES) expect(parseAccelerator(c.value)).not.toBeNull();
  });
});
