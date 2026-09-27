/**
 * Accelerator helpers shared by the OS-level registration (Tauri global
 * shortcut plugin syntax) and the in-window keydown fallback.
 */
export interface ParsedAccelerator {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  /** KeyboardEvent.code, e.g. "Backquote", "KeyP", "F9". */
  code: string;
  /** Human label, e.g. "Ctrl + Shift + `". */
  label: string;
}

const KEY_TO_CODE: Record<string, string> = {
  "`": "Backquote", "~": "Backquote", "-": "Minus", "=": "Equal", "[": "BracketLeft", "]": "BracketRight",
  "\\": "Backslash", ";": "Semicolon", "'": "Quote", ",": "Comma", ".": "Period", "/": "Slash", space: "Space",
};
const CODE_TO_LABEL: Record<string, string> = { Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Space: "Space" };

export function parseAccelerator(accel: string): ParsedAccelerator | null {
  const parts = accel.split("+").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const key = parts[parts.length - 1]!;
  const mods = parts.slice(0, -1).map((m) => m.toLowerCase());
  const ctrl = mods.some((m) => m === "commandorcontrol" || m === "ctrl" || m === "control" || m === "cmdorctrl" || m === "super");
  const shift = mods.includes("shift");
  const alt = mods.includes("alt") || mods.includes("option");
  let code: string;
  const k = key.toLowerCase();
  if (KEY_TO_CODE[k]) code = KEY_TO_CODE[k]!;
  else if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(key)) code = key.toUpperCase();
  else if (/^[a-z]$/i.test(key)) code = `Key${key.toUpperCase()}`;
  else if (/^[0-9]$/.test(key)) code = `Digit${key}`;
  else return null;
  // A bare letter/digit/backquote without any modifier would hijack typing.
  if (!ctrl && !alt && !/^F\d+$/.test(code)) return null;
  const label = [ctrl && "Ctrl", shift && "Shift", alt && "Alt", CODE_TO_LABEL[code] ?? code.replace(/^Key|^Digit/, "")].filter(Boolean).join(" + ");
  return { ctrl, shift, alt, code, label };
}

export function matchesAccelerator(e: KeyboardEvent, parsed: ParsedAccelerator): boolean {
  return e.ctrlKey === parsed.ctrl && e.shiftKey === parsed.shift && e.altKey === parsed.alt && e.code === parsed.code;
}

/** Curated, collision-safe choices for the privacy hotkey. */
export const PRIVACY_HOTKEY_CHOICES: { value: string; label: string }[] = [
  { value: "CommandOrControl+Shift+`", label: "Ctrl + Shift + `" },
  { value: "CommandOrControl+Shift+P", label: "Ctrl + Shift + P" },
  { value: "CommandOrControl+Alt+P", label: "Ctrl + Alt + P" },
  { value: "Alt+Shift+P", label: "Alt + Shift + P" },
  { value: "F9", label: "F9" },
  { value: "F10", label: "F10" },
].filter((c) => parseAccelerator(c.value) != null);
