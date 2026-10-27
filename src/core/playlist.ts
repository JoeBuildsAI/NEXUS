/**
 * Folder playback model. Pure: which video plays next, and what happens at the
 * end of a video under each repeat mode. A–B looping (see loop.ts) takes
 * precedence over repeat while it is engaged.
 */

export type RepeatMode = "off" | "one" | "all";

export interface PlaylistItem {
  readonly path: string;
  readonly playable: boolean;
}

export function nextRepeat(mode: RepeatMode): RepeatMode {
  return mode === "off" ? "one" : mode === "one" ? "all" : "off";
}

/** Neighbouring playable video in folder order; null at the ends unless wrapping. */
export function neighbor(items: readonly PlaylistItem[], current: string | null, dir: 1 | -1, wrap: boolean): string | null {
  const playable = items.filter((i) => i.playable);
  if (!playable.length) return null;
  const at = playable.findIndex((i) => i.path === current);
  if (at < 0) return playable[dir === 1 ? 0 : playable.length - 1]!.path;
  const next = at + dir;
  if (next >= 0 && next < playable.length) return playable[next]!.path;
  if (!wrap || playable.length === 1) return null;
  return playable[(next + playable.length) % playable.length]!.path;
}

export type EndedAction = { kind: "replay" } | { kind: "play"; path: string } | { kind: "stop" };

/** What to do when a video reaches its end. */
export function onEnded(repeat: RepeatMode, items: readonly PlaylistItem[], current: string | null): EndedAction {
  if (repeat === "one") return { kind: "replay" };
  if (repeat === "all") {
    const next = neighbor(items, current, 1, true);
    return next && next !== current ? { kind: "play", path: next } : { kind: "replay" };
  }
  return { kind: "stop" };
}
