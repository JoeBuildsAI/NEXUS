/**
 * What outlives a window. Every NEXUS window is its own document with its own
 * in-memory playback state; only these small, independent records are shared
 * through localStorage:
 *
 *  - window defaults (volume, mute, speed, repeat, folder panel): read once when a
 *    window starts, written when the user changes them — the newest choice seeds
 *    the NEXT window and never touches windows that are already open;
 *  - A–B presets, one key per video identity: a window writes only the video it
 *    is editing, so windows can't clobber each other's presets with stale copies;
 *  - the last opened file (reopened by the first window at app start).
 */

import type { RepeatMode } from "./playlist";

export interface Markers {
  a: number | null;
  b: number | null;
}

export interface WindowDefaults {
  volume: number;
  muted: boolean;
  rate: number;
  repeat: RepeatMode;
  panelOpen: boolean;
}

export const DEFAULTS: WindowDefaults = { volume: 1, muted: false, rate: 1, repeat: "off", panelOpen: true };
export const NO_MARKERS: Markers = Object.freeze({ a: null, b: null });

const DEFAULTS_KEY = "nexus.window-defaults.v1";
const LAST_FILE_KEY = "nexus.last-file.v1";
const AB_PREFIX = "nexus.ab.v1:";
const LEGACY_KEY = "nexus-player";
/** Presets kept; the least recently edited are pruned beyond this. */
export const MAX_PRESETS = 500;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const read = <T>(s: Store, key: string): T | null => {
  try {
    const raw = s.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};
const write = (s: Store, key: string, value: unknown) => {
  try {
    s.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: persistence is best-effort.
  }
};

const num = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const time = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

export function loadDefaults(s: Store): WindowDefaults {
  const d = read<Partial<WindowDefaults>>(s, DEFAULTS_KEY) ?? {};
  return {
    volume: num(d.volume, 0, 1, DEFAULTS.volume),
    muted: typeof d.muted === "boolean" ? d.muted : DEFAULTS.muted,
    rate: num(d.rate, 0.25, 4, DEFAULTS.rate),
    repeat: d.repeat === "one" || d.repeat === "all" || d.repeat === "off" ? d.repeat : DEFAULTS.repeat,
    panelOpen: typeof d.panelOpen === "boolean" ? d.panelOpen : DEFAULTS.panelOpen,
  };
}

export function saveDefaults(s: Store, d: WindowDefaults) {
  write(s, DEFAULTS_KEY, d);
}

export const loadLastFile = (s: Store): string | null => read<string>(s, LAST_FILE_KEY);
export const saveLastFile = (s: Store, path: string) => write(s, LAST_FILE_KEY, path);

/** Stable identity for a video file (case-insensitive Windows path, FNV-1a 64). */
export function videoId(path: string): string {
  const norm = path.replace(/\//g, "\\").toLowerCase();
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < norm.length; i++) {
    h ^= BigInt(norm.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

export function loadMarkers(s: Store, path: string): Markers {
  const m = read<{ a?: unknown; b?: unknown }>(s, AB_PREFIX + videoId(path));
  return m ? { a: time(m.a), b: time(m.b) } : NO_MARKERS;
}

export function saveMarkers(s: Store, path: string, m: Markers, now = Date.now()) {
  const key = AB_PREFIX + videoId(path);
  if (m.a == null && m.b == null) {
    s.removeItem(key);
    return;
  }
  write(s, key, { a: m.a, b: m.b, at: now });
  prunePresets(s);
}

export function prunePresets(s: Store, max = MAX_PRESETS) {
  const entries: { key: string; at: number }[] = [];
  for (let i = 0; i < s.length; i++) {
    const key = s.key(i);
    if (key?.startsWith(AB_PREFIX)) entries.push({ key, at: read<{ at?: number }>(s, key)?.at ?? 0 });
  }
  if (entries.length <= max) return;
  entries.sort((x, y) => x.at - y.at);
  for (const e of entries.slice(0, entries.length - max)) s.removeItem(e.key);
}

/** One-time move from the 0.6.0 single-blob store to the per-record layout. */
export function migrateLegacy(s: Store) {
  const legacy = read<{ state?: Partial<WindowDefaults> & { lastFile?: string | null; markers?: Record<string, Markers> } }>(s, LEGACY_KEY);
  if (!legacy) return;
  const st = legacy.state ?? {};
  if (!s.getItem(DEFAULTS_KEY)) saveDefaults(s, loadDefaultsFrom(st));
  if (st.lastFile && !s.getItem(LAST_FILE_KEY)) saveLastFile(s, st.lastFile);
  let at = 1;
  for (const [path, m] of Object.entries(st.markers ?? {})) {
    if (!s.getItem(AB_PREFIX + videoId(path))) saveMarkers(s, path, { a: time(m?.a), b: time(m?.b) }, at++);
  }
  s.removeItem(LEGACY_KEY);
}

function loadDefaultsFrom(d: Partial<WindowDefaults>): WindowDefaults {
  const mem = new Map<string, string>([[DEFAULTS_KEY, JSON.stringify(d)]]);
  return loadDefaults({ getItem: (k) => mem.get(k) ?? null, setItem: () => undefined, removeItem: () => undefined, key: () => null, length: 0 });
}
