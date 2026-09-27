import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isObj, safeStorage, vArr, vBool, vNum, vOneOf } from "./persistence";
import type { FitMode, LoopMode, PlayerSlot, SavedPlayer, WorkspaceLayout } from "@/core/types";
import type { WallMode } from "@/core/media/layout";
import { validateSegment } from "@/core/media/loop";

export const SLOT_COUNT = 6;
export const WALL_MODES: { id: WallMode; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "grid", label: "Grid" },
  { id: "primary", label: "Primary" },
  { id: "focus", label: "Focus" },
];
const FIT_MODES: FitMode[] = ["fit", "fill", "smart"];
const LOOP_MODES: LoopMode[] = ["off", "full", "ab"];
const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

function emptySlot(index: number, loop: LoopMode = "full"): PlayerSlot {
  return { index, itemId: null, playing: false, muted: true, volume: 0.8, fit: null, loop, loopA: null, loopB: null, rate: 1 };
}
function emptySlots(loop: LoopMode = "full"): PlayerSlot[] {
  return Array.from({ length: SLOT_COUNT }, (_, i) => emptySlot(i, loop));
}

/** Workspace defaults new players inherit (Settings → Media). */
export interface WorkspaceDefaults {
  autoplay: boolean;
  loop: LoopMode;
  fit: FitMode;
  mutedOnLoad: boolean;
  restoreVolume: boolean;
  restorePosition: boolean;
  /** Focus mode pauses the players that leave the wall. */
  focusPausesOthers: boolean;
}
export const DEFAULT_WORKSPACE_DEFAULTS: WorkspaceDefaults = { autoplay: false, loop: "full", fit: "smart", mutedOnLoad: true, restoreVolume: true, restorePosition: false, focusPausesOthers: false };

interface MediaState {
  /** Session-only: the restored workspace has been revealed by the user. */
  revealed: boolean;
  reveal: () => void;
  mode: WallMode;
  /** Player given extra weight by the optimizer / shown alone in Focus. */
  primaryIndex: number | null;
  focusIndex: number;
  /** Keyboard-focused player (session only). */
  activeIndex: number | null;
  slots: PlayerSlot[];
  savedLayouts: WorkspaceLayout[];
  /** When true, play/pause/seek on one player is mirrored to all loaded players. */
  syncPlayback: boolean;
  /** Monotonic seek broadcast: { seq, time } — players apply when seq changes. */
  seekRequest: { seq: number; time: number; only: number | null } | null;
  /** Monotonic "sync start" broadcast: all players seek 0 and play together. */
  syncStartSeq: number;
  defaults: WorkspaceDefaults;
  /** Last known volume per item (restoreVolume). Session + persisted, capped. */
  lastVolume: Record<string, number>;
  lastPosition: Record<string, number>;

  setMode: (mode: WallMode) => void;
  setPrimary: (index: number | null) => void;
  setFocusIndex: (index: number) => void;
  setActiveIndex: (index: number | null) => void;
  /** Add an item to the first free player; returns the index or null when full. */
  addToWall: (itemId: string, opts?: { primary?: boolean; play?: boolean }) => number | null;
  /** Browser surfaces (isolated web pages) share the wall with videos. */
  addBrowser: (url: string) => number | null;
  setBrowserUrl: (index: number, url: string) => void;
  setBrowserAspect: (index: number, aspect: number) => void;
  setSlotItem: (index: number, itemId: string | null) => void;
  clearSlot: (index: number) => void;
  clearAll: () => void;
  swapSlots: (a: number, b: number) => void;
  setSlotPlaying: (index: number, playing: boolean) => void;
  setSlotMuted: (index: number, muted: boolean) => void;
  setSlotVolume: (index: number, volume: number) => void;
  setSlotFit: (index: number, fit: FitMode | null) => void;
  setSlotRate: (index: number, rate: number) => void;
  setSlotLoop: (index: number, loop: LoopMode) => void;
  /** Set A/B at the given time; validated against `duration` when known. Returns an error key or null. */
  setLoopPoint: (index: number, which: "a" | "b", time: number, duration: number | null) => string | null;
  setSegment: (index: number, a: number, b: number, duration: number | null) => string | null;
  clearSegment: (index: number) => void;
  requestSeek: (time: number, only?: number | null) => void;
  syncStart: () => void;
  playAll: () => void;
  pauseAll: () => void;
  muteAll: (muted: boolean) => void;
  setSyncPlayback: (sync: boolean) => void;
  setDefaults: (patch: Partial<WorkspaceDefaults>) => void;
  rememberVolume: (itemId: string, volume: number) => void;
  rememberPosition: (itemId: string, position: number) => void;
  saveWorkspace: (name: string, positions?: Record<number, number>) => void;
  renameLayout: (id: string, name: string) => void;
  restoreLayout: (id: string) => void;
  deleteLayout: (id: string) => void;
  /** Privacy: wipe players, positions, volumes and recent state. */
  clearPrivateWorkspace: () => void;
}

const validSlot = (sl: unknown, i: number, loop: LoopMode): PlayerSlot => {
  const o = isObj(sl) ? sl : {};
  return {
    index: i,
    itemId: typeof o.itemId === "string" ? o.itemId : null,
    browser: isObj(o.browser) && typeof o.browser.url === "string" && o.browser.url.startsWith("https://") && o.browser.url.length < 2048 ? { url: o.browser.url, aspect: vNum(o.browser.aspect, 16 / 9, 0.25, 4) } : null,
    playing: false,
    muted: vBool(o.muted, true),
    volume: vNum(o.volume, 0.8, 0, 1),
    fit: o.fit == null ? null : vOneOf(o.fit, FIT_MODES, "smart"),
    loop: vOneOf(o.loop, LOOP_MODES, loop),
    loopA: typeof o.loopA === "number" && Number.isFinite(o.loopA) && o.loopA >= 0 ? o.loopA : null,
    loopB: typeof o.loopB === "number" && Number.isFinite(o.loopB) && o.loopB > 0 ? o.loopB : null,
    rate: RATES.includes(o.rate as number) ? (o.rate as number) : 1,
  };
};

export const useMediaStore = create<MediaState>()(
  persist(
    (set, get) => ({
      revealed: false,
      reveal: () => set({ revealed: true }),
      mode: "auto",
      primaryIndex: null,
      focusIndex: 0,
      activeIndex: null,
      slots: emptySlots(),
      savedLayouts: [],
      syncPlayback: false,
      seekRequest: null,
      syncStartSeq: 0,
      defaults: DEFAULT_WORKSPACE_DEFAULTS,
      lastVolume: {},
      lastPosition: {},

      setMode: (mode) =>
        set((s) => {
          if (mode === "focus" && s.defaults.focusPausesOthers) {
            const keep = s.activeIndex ?? s.focusIndex;
            return { mode, focusIndex: keep, slots: s.slots.map((sl) => (sl.index === keep ? sl : { ...sl, playing: false })) };
          }
          return { mode };
        }),
      setPrimary: (primaryIndex) => set({ primaryIndex }),
      setFocusIndex: (focusIndex) => set({ focusIndex }),
      setActiveIndex: (activeIndex) => set({ activeIndex }),

      addBrowser: (url) => {
        const s = get();
        const free = s.slots.find((sl) => !sl.itemId && !sl.browser);
        if (!free) return null;
        set((st) => ({ slots: st.slots.map((sl) => (sl.index === free.index ? { ...emptySlot(free.index, st.defaults.loop), browser: { url, aspect: 16 / 9 } } : sl)), activeIndex: free.index }));
        return free.index;
      },
      setBrowserUrl: (index, url) => set((s) => ({ slots: s.slots.map((sl) => (sl.index === index && sl.browser ? { ...sl, browser: { ...sl.browser, url } } : sl)) })),
      setBrowserAspect: (index, aspect) => set((s) => ({ slots: s.slots.map((sl) => (sl.index === index && sl.browser ? { ...sl, browser: { ...sl.browser, aspect: Math.min(4, Math.max(0.25, aspect)) } } : sl)) })),

      addToWall: (itemId, opts) => {
        const s = get();
        const free = s.slots.find((sl) => !sl.itemId && !sl.browser);
        if (!free) return null;
        const d = s.defaults;
        const volume = d.restoreVolume && s.lastVolume[itemId] != null ? s.lastVolume[itemId]! : 0.8;
        set((st) => ({
          slots: st.slots.map((sl) => (sl.index === free.index ? { ...emptySlot(free.index, d.loop), itemId, muted: d.mutedOnLoad, volume, playing: opts?.play ?? d.autoplay } : sl)),
          primaryIndex: opts?.primary ? free.index : st.primaryIndex,
          activeIndex: free.index,
        }));
        return free.index;
      },
      setSlotItem: (index, itemId) =>
        set((s) => ({
          slots: s.slots.map((sl) => (sl.index === index ? { ...emptySlot(index, s.defaults.loop), itemId, muted: s.defaults.mutedOnLoad, volume: itemId && s.defaults.restoreVolume && s.lastVolume[itemId] != null ? s.lastVolume[itemId]! : 0.8, playing: itemId ? s.defaults.autoplay : false } : sl)),
        })),
      clearSlot: (index) =>
        set((s) => ({
          slots: s.slots.map((sl) => (sl.index === index ? emptySlot(index, s.defaults.loop) : sl)),
          primaryIndex: s.primaryIndex === index ? null : s.primaryIndex,
          activeIndex: s.activeIndex === index ? null : s.activeIndex,
        })),
      clearAll: () => set((s) => ({ slots: emptySlots(s.defaults.loop), primaryIndex: null, activeIndex: null, mode: s.mode === "focus" ? "auto" : s.mode })),
      swapSlots: (a, b) =>
        set((s) => {
          const slots = [...s.slots];
          const sa = slots[a], sb = slots[b];
          if (!sa || !sb) return {};
          slots[a] = { ...sb, index: a };
          slots[b] = { ...sa, index: b };
          const primaryIndex = s.primaryIndex === a ? b : s.primaryIndex === b ? a : s.primaryIndex;
          return { slots, primaryIndex };
        }),

      setSlotPlaying: (index, playing) =>
        set((s) => (s.syncPlayback ? { slots: s.slots.map((sl) => (sl.itemId ? { ...sl, playing } : sl)) } : { slots: s.slots.map((sl) => (sl.index === index ? { ...sl, playing } : sl)) })),
      setSlotMuted: (index, muted) => set((s) => ({ slots: s.slots.map((sl) => (sl.index === index ? { ...sl, muted } : sl)) })),
      setSlotVolume: (index, volume) =>
        set((s) => {
          const sl = s.slots[index];
          const lastVolume = sl?.itemId ? { ...s.lastVolume, [sl.itemId]: volume } : s.lastVolume;
          return { slots: s.slots.map((x) => (x.index === index ? { ...x, volume } : x)), lastVolume: trimMap(lastVolume) };
        }),
      setSlotFit: (index, fit) => set((s) => ({ slots: s.slots.map((sl) => (sl.index === index ? { ...sl, fit } : sl)) })),
      setSlotRate: (index, rate) => set((s) => ({ slots: s.slots.map((sl) => (sl.index === index ? { ...sl, rate: RATES.includes(rate) ? rate : 1 } : sl)) })),
      setSlotLoop: (index, loop) =>
        set((s) => ({
          slots: s.slots.map((sl) => (sl.index === index ? { ...sl, loop: loop === "ab" && (sl.loopA == null || sl.loopB == null) ? sl.loop : loop } : sl)),
        })),
      setLoopPoint: (index, which, time, duration) => {
        const sl = get().slots[index];
        if (!sl) return "no-player";
        const a = which === "a" ? time : sl.loopA;
        const b = which === "b" ? time : sl.loopB;
        // Partial state is fine (only one point so far): store it, engage A–B once both exist and validate.
        if (a == null || b == null) {
          set((s) => ({ slots: s.slots.map((x) => (x.index === index ? { ...x, loopA: a == null ? null : Math.max(0, a), loopB: b == null ? null : b } : x)) }));
          return null;
        }
        const v = validateSegment(a, b, duration);
        if (!v.ok) {
          // Keep the newly set point so the user can fix the other one.
          set((s) => ({ slots: s.slots.map((x) => (x.index === index ? { ...x, [which === "a" ? "loopA" : "loopB"]: time } : x)) }));
          return v.error;
        }
        set((s) => ({ slots: s.slots.map((x) => (x.index === index ? { ...x, loopA: v.segment.a, loopB: v.segment.b, loop: "ab" } : x)) }));
        return null;
      },
      setSegment: (index, a, b, duration) => {
        const v = validateSegment(a, b, duration);
        if (!v.ok) return v.error;
        set((s) => ({ slots: s.slots.map((x) => (x.index === index ? { ...x, loopA: v.segment.a, loopB: v.segment.b, loop: "ab" } : x)) }));
        return null;
      },
      clearSegment: (index) => set((s) => ({ slots: s.slots.map((x) => (x.index === index ? { ...x, loopA: null, loopB: null, loop: x.loop === "ab" ? "full" : x.loop } : x)) })),

      requestSeek: (time, only = null) => set((s) => ({ seekRequest: { seq: (s.seekRequest?.seq ?? 0) + 1, time, only: s.syncPlayback ? null : only } })),
      syncStart: () => set((s) => ({ syncStartSeq: s.syncStartSeq + 1, slots: s.slots.map((sl) => (sl.itemId ? { ...sl, playing: true } : sl)) })),
      playAll: () => set((s) => ({ slots: s.slots.map((sl) => (sl.itemId ? { ...sl, playing: true } : sl)) })),
      pauseAll: () => set((s) => ({ slots: s.slots.map((sl) => ({ ...sl, playing: false })) })),
      muteAll: (muted) => set((s) => ({ slots: s.slots.map((sl) => ({ ...sl, muted })) })),
      setSyncPlayback: (syncPlayback) => set({ syncPlayback }),
      setDefaults: (patch) => set((s) => ({ defaults: { ...s.defaults, ...patch } })),
      rememberVolume: (itemId, volume) => set((s) => ({ lastVolume: trimMap({ ...s.lastVolume, [itemId]: volume }) })),
      rememberPosition: (itemId, position) => set((s) => (s.defaults.restorePosition ? { lastPosition: trimMap({ ...s.lastPosition, [itemId]: position }) } : {})),

      saveWorkspace: (name, positions) =>
        set((s) => ({
          savedLayouts: [
            ...s.savedLayouts,
            {
              id: `layout-${Date.now()}`,
              name,
              columns: 0,
              rows: 0,
              layout: s.mode,
              slots: s.slots.map((sl) => sl.itemId),
              players: s.slots.filter((sl) => sl.itemId).map((sl) => ({ itemId: sl.itemId!, fit: sl.fit, loop: sl.loop, loopA: sl.loopA, loopB: sl.loopB, volume: sl.volume, muted: sl.muted, rate: sl.rate, position: positions?.[sl.index] ?? null })),
              primaryIndex: s.primaryIndex,
              savedAt: Date.now(),
            },
          ].slice(-30),
        })),
      renameLayout: (id, name) => set((s) => ({ savedLayouts: s.savedLayouts.map((l) => (l.id === id ? { ...l, name } : l)) })),
      restoreLayout: (id) => {
        const layout = get().savedLayouts.find((l) => l.id === id);
        if (!layout) return;
        const d = get().defaults;
        const slots = emptySlots(d.loop);
        if (layout.players?.length) {
          layout.players.slice(0, SLOT_COUNT).forEach((p, i) => {
            slots[i] = { index: i, itemId: p.itemId, playing: false, muted: true, volume: p.volume, fit: p.fit, loop: p.loop, loopA: p.loopA, loopB: p.loopB, rate: p.rate };
          });
        } else {
          layout.slots.forEach((itemId, i) => { if (i < SLOT_COUNT && itemId) slots[i] = { ...emptySlot(i, d.loop), itemId }; });
        }
        const legacy: Record<string, WallMode> = { "3x2": "grid", "2x3": "grid", "2x2-primary": "primary", focus: "focus" };
        const mode = (WALL_MODES.some((m) => m.id === layout.layout) ? layout.layout : legacy[layout.layout ?? ""] ?? "auto") as WallMode;
        set({ mode, slots, primaryIndex: layout.primaryIndex ?? null, revealed: true });
      },
      deleteLayout: (id) => set((s) => ({ savedLayouts: s.savedLayouts.filter((l) => l.id !== id) })),
      clearPrivateWorkspace: () => set((s) => ({ slots: emptySlots(s.defaults.loop), primaryIndex: null, activeIndex: null, lastVolume: {}, lastPosition: {}, mode: "auto", revealed: true })),
    }),
    {
      name: "nexus-media-workspace",
      version: 3,
      storage: safeStorage(),
      // Never persist playing state (privacy + no autoplay on restore).
      partialize: (s) => ({
        mode: s.mode,
        primaryIndex: s.primaryIndex,
        focusIndex: s.focusIndex,
        savedLayouts: s.savedLayouts,
        syncPlayback: s.syncPlayback,
        defaults: s.defaults,
        lastVolume: s.lastVolume,
        lastPosition: s.lastPosition,
        slots: s.slots.map((sl) => ({ ...sl, playing: false })),
      }),
      merge: (persisted, current) => {
        const p = isObj(persisted) ? persisted : {};
        const d = isObj(p.defaults) ? p.defaults : {};
        const defaults: WorkspaceDefaults = {
          autoplay: vBool(d.autoplay, DEFAULT_WORKSPACE_DEFAULTS.autoplay),
          loop: vOneOf(d.loop, LOOP_MODES, DEFAULT_WORKSPACE_DEFAULTS.loop),
          fit: vOneOf(d.fit, FIT_MODES, DEFAULT_WORKSPACE_DEFAULTS.fit),
          mutedOnLoad: vBool(d.mutedOnLoad, DEFAULT_WORKSPACE_DEFAULTS.mutedOnLoad),
          restoreVolume: vBool(d.restoreVolume, DEFAULT_WORKSPACE_DEFAULTS.restoreVolume),
          restorePosition: vBool(d.restorePosition, DEFAULT_WORKSPACE_DEFAULTS.restorePosition),
          focusPausesOthers: vBool(d.focusPausesOthers, DEFAULT_WORKSPACE_DEFAULTS.focusPausesOthers),
        };
        // v2 stored a fixed layout id; map to a wall mode.
        const legacy: Record<string, WallMode> = { "3x2": "grid", "2x3": "grid", "2x2-primary": "primary", focus: "focus" };
        const mode = WALL_MODES.some((m) => m.id === p.mode) ? (p.mode as WallMode) : typeof p.layout === "string" && legacy[p.layout] ? legacy[p.layout]! : "auto";
        const rawSlots = Array.isArray(p.slots) && p.slots.length === SLOT_COUNT ? (p.slots as unknown[]) : [];
        const slots = rawSlots.length ? rawSlots.map((sl, i) => validSlot(sl, i, defaults.loop)) : emptySlots(defaults.loop);
        const numMap = (v: unknown): Record<string, number> => (isObj(v) ? Object.fromEntries(Object.entries(v).filter(([k, x]) => typeof k === "string" && typeof x === "number" && Number.isFinite(x)).slice(0, 500)) as Record<string, number> : {});
        return {
          ...current,
          mode,
          primaryIndex: typeof p.primaryIndex === "number" && p.primaryIndex >= 0 && p.primaryIndex < SLOT_COUNT ? p.primaryIndex : null,
          focusIndex: vNum(p.focusIndex, 0, 0, SLOT_COUNT - 1),
          syncPlayback: vBool(p.syncPlayback, false),
          savedLayouts: vArr(p.savedLayouts, (x): x is WorkspaceLayout => isObj(x) && typeof x.id === "string" && typeof x.name === "string" && Array.isArray(x.slots), [], 30),
          defaults,
          lastVolume: numMap(p.lastVolume),
          lastPosition: numMap(p.lastPosition),
          slots,
          seekRequest: null,
          revealed: false,
          activeIndex: null,
        };
      },
    },
  ),
);

/** Keep per-item maps bounded (privacy + storage). */
function trimMap(m: Record<string, number>): Record<string, number> {
  const keys = Object.keys(m);
  if (keys.length <= 500) return m;
  return Object.fromEntries(keys.slice(keys.length - 500).map((k) => [k, m[k]!]));
}

export type { SavedPlayer };
