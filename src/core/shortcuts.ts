export type ShortcutAction =
  | "toggle-play" | "seek-back" | "seek-fwd" | "seek-back-long" | "seek-fwd-long" | "frame-back" | "frame-fwd"
  | "set-a" | "set-b" | "toggle-loop" | "clear-markers" | "jump-a" | "cycle-repeat"
  | "next" | "prev" | "fullscreen" | "exit-fullscreen" | "mute" | "vol-up" | "vol-down"
  | "slower" | "faster" | "toggle-panel" | "open";

interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

/** Map a key press to a player action (null = not ours, let it through). */
export function shortcutFor(e: KeyLike): ShortcutAction | null {
  if (e.altKey) return null;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.ctrlKey || e.metaKey) return k === "o" ? "open" : null;
  switch (k) {
    case " ": case "k": return "toggle-play";
    case "ArrowLeft": return e.shiftKey ? "seek-back-long" : "seek-back";
    case "ArrowRight": return e.shiftKey ? "seek-fwd-long" : "seek-fwd";
    case ",": return "frame-back";
    case ".": return "frame-fwd";
    case "i": return "set-a";
    case "o": return "set-b";
    case "l": return "toggle-loop";
    case "x": return "clear-markers";
    case "a": return "jump-a";
    case "r": return "cycle-repeat";
    case "n": case "PageDown": return "next";
    case "p": case "PageUp": return "prev";
    case "f": return "fullscreen";
    case "Escape": return "exit-fullscreen";
    case "m": return "mute";
    case "ArrowUp": return "vol-up";
    case "ArrowDown": return "vol-down";
    case "[": return "slower";
    case "]": return "faster";
    case "b": return "toggle-panel";
    default: return null;
  }
}
