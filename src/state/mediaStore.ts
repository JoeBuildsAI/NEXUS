import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isObj, safeStorage, vArr, vBool, vNum, vOneOf } from "./persistence";
import type { PlayerSlot, WorkspaceLayout } from "@/core/types";

export type LayoutId = "3x2" | "2x3" | "2x2-primary" | "focus";

export const LAYOUTS: Record<LayoutId, { label: string; slots: number; columns: number; rows: number }> = {
  "3x2": { label: "3 × 2", slots: 6, columns: 3, rows: 2 },
  "2x3": { label: "2 × 3", slots: 6, columns: 2, rows: 3 },
  "2x2-primary": { label: "Primary + 4", slots: 5, columns: 3, rows: 2 },
  focus: { label: "Focus", slots: 6, columns: 1, rows: 1 },
};

const SLOT_COUNT = 6;

function emptySlots(): PlayerSlot[] {
  return Array.from({ length: SLOT_COUNT }, (_, index) => ({ index, itemId: null, playing: false, muted: false, volume: 0.8 }));
}

interface MediaState {
  /** Session-only: the restored workspace has been revealed by the user. */
  revealed: boolean;
  reveal: () => void;
  layout: LayoutId;
  /** Slot shown large in focus / primary layouts. */
  focusIndex: number;
  slots: PlayerSlot[];
  savedLayouts: WorkspaceLayout[];
  /** When true, play/pause/seek on one player is mirrored to all loaded players. */
  syncPlayback: boolean;
  /** Monotonic seek broadcast: { seq, time } — players apply when seq changes. */
  seekRequest: { seq: number; time: number; only: number | null } | null;
  setLayout: (layout: LayoutId) => void;
  setFocusIndex: (index: number) => void;
  setSlotItem: (index: number, itemId: string | null) => void;
  clearSlot: (index: number) => void;
  clearAll: () => void;
  setSlotPlaying: (index: number, playing: boolean) => void;
  setSlotMuted: (index: number, muted: boolean) => void;
  setSlotVolume: (index: number, volume: number) => void;
  requestSeek: (time: number, only?: number | null) => void;
  playAll: () => void;
  pauseAll: () => void;
  muteAll: (muted: boolean) => void;
  setSyncPlayback: (sync: boolean) => void;
  saveLayout: (name: string) => void;
  renameLayout: (id: string, name: string) => void;
  restoreLayout: (id: string) => void;
  deleteLayout: (id: string) => void;
  /** Legacy grid API kept for compatibility. */
  columns: number;
  rows: number;
}

export const useMediaStore = create<MediaState>()(
  persist(
    (set, get) => ({
      layout: "3x2",
      focusIndex: 0,
      slots: emptySlots(),
      savedLayouts: [],
      syncPlayback: false,
      seekRequest: null,
      revealed: false,
      reveal: () => set({ revealed: true }),
      columns: 3,
      rows: 2,

      setLayout: (layout) => set({ layout, columns: LAYOUTS[layout].columns, rows: LAYOUTS[layout].rows }),
      setFocusIndex: (focusIndex) => set({ focusIndex }),
      setSlotItem: (index, itemId) =>
        set((s) => ({ slots: s.slots.map((sl) => (sl.index === index ? { ...sl, itemId, playing: false } : sl)) })),
      clearSlot: (index) =>
        set((s) => ({ slots: s.slots.map((sl) => (sl.index === index ? { ...sl, itemId: null, playing: false } : sl)) })),
      clearAll: () => set({ slots: emptySlots() }),
      setSlotPlaying: (index, playing) =>
        set((s) =>
          s.syncPlayback
            ? { slots: s.slots.map((sl) => (sl.itemId ? { ...sl, playing } : sl)) }
            : { slots: s.slots.map((sl) => (sl.index === index ? { ...sl, playing } : sl)) },
        ),
      setSlotMuted: (index, muted) =>
        set((s) => ({ slots: s.slots.map((sl) => (sl.index === index ? { ...sl, muted } : sl)) })),
      setSlotVolume: (index, volume) =>
        set((s) => ({ slots: s.slots.map((sl) => (sl.index === index ? { ...sl, volume } : sl)) })),
      requestSeek: (time, only = null) =>
        set((s) => ({ seekRequest: { seq: (s.seekRequest?.seq ?? 0) + 1, time, only: s.syncPlayback ? null : only } })),
      playAll: () => set((s) => ({ slots: s.slots.map((sl) => (sl.itemId ? { ...sl, playing: true } : sl)) })),
      pauseAll: () => set((s) => ({ slots: s.slots.map((sl) => ({ ...sl, playing: false })) })),
      muteAll: (muted) => set((s) => ({ slots: s.slots.map((sl) => ({ ...sl, muted })) })),
      setSyncPlayback: (syncPlayback) => set({ syncPlayback }),

      saveLayout: (name) =>
        set((s) => ({
          savedLayouts: [
            ...s.savedLayouts,
            { id: `layout-${Date.now()}`, name, columns: LAYOUTS[s.layout].columns, rows: LAYOUTS[s.layout].rows, layout: s.layout, slots: s.slots.map((sl) => sl.itemId), savedAt: Date.now() },
          ],
        })),
      renameLayout: (id, name) => set((s) => ({ savedLayouts: s.savedLayouts.map((l) => (l.id === id ? { ...l, name } : l)) })),
      restoreLayout: (id) => {
        const layout = get().savedLayouts.find((l) => l.id === id);
        if (!layout) return;
        const slots = emptySlots().map((sl, i) => ({ ...sl, itemId: layout.slots[i] ?? null }));
        const lid = (layout.layout as LayoutId | undefined) ?? "3x2";
        set({ layout: lid, columns: LAYOUTS[lid].columns, rows: LAYOUTS[lid].rows, slots });
      },
      deleteLayout: (id) => set((s) => ({ savedLayouts: s.savedLayouts.filter((l) => l.id !== id) })),
    }),
    {
      name: "nexus-media-workspace",
      version: 2,
      storage: safeStorage(),
      // Do not persist playing state (privacy + avoids autoplay on restore).
      partialize: (s) => ({
        layout: s.layout,
        focusIndex: s.focusIndex,
        savedLayouts: s.savedLayouts,
        syncPlayback: s.syncPlayback,
        columns: s.columns,
        rows: s.rows,
        slots: s.slots.map((sl) => ({ ...sl, playing: false })),
      }),
      merge: (persisted, current) => {
        const p = isObj(persisted) ? persisted : {};
        const layout = vOneOf(p.layout, Object.keys(LAYOUTS) as LayoutId[], current.layout);
        const rawSlots = Array.isArray(p.slots) && p.slots.length === SLOT_COUNT ? (p.slots as unknown[]) : [];
        const slots = rawSlots.length
          ? rawSlots.map((sl, i) => {
              const o = isObj(sl) ? sl : {};
              return { index: i, itemId: typeof o.itemId === "string" ? o.itemId : null, playing: false, muted: vBool(o.muted, true), volume: vNum(o.volume, 0.8, 0, 1) };
            })
          : current.slots;
        return {
          ...current,
          layout,
          columns: LAYOUTS[layout].columns,
          rows: LAYOUTS[layout].rows,
          focusIndex: vNum(p.focusIndex, 0, 0, SLOT_COUNT - 1),
          syncPlayback: vBool(p.syncPlayback, false),
          savedLayouts: vArr(p.savedLayouts, (x): x is WorkspaceLayout => isObj(x) && typeof x.id === "string" && typeof x.name === "string" && Array.isArray(x.slots), [], 30),
          slots,
          seekRequest: null,
        };
      },
    },
  ),
);
