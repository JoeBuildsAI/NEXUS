import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PlayerSlot, WorkspaceLayout } from "@/core/types";

const DEFAULT_SLOT_COUNT = 6;

function emptySlots(count = DEFAULT_SLOT_COUNT): PlayerSlot[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    itemId: null,
    playing: false,
    muted: false,
    volume: 0.8,
  }));
}

interface MediaState {
  columns: number;
  rows: number;
  slots: PlayerSlot[];
  savedLayouts: WorkspaceLayout[];
  setSlotItem: (index: number, itemId: string | null) => void;
  clearSlot: (index: number) => void;
  clearAll: () => void;
  setSlotPlaying: (index: number, playing: boolean) => void;
  setSlotMuted: (index: number, muted: boolean) => void;
  setSlotVolume: (index: number, volume: number) => void;
  playAll: () => void;
  pauseAll: () => void;
  muteAll: (muted: boolean) => void;
  setGrid: (columns: number, rows: number) => void;
  saveLayout: (name: string) => void;
  restoreLayout: (id: string) => void;
  deleteLayout: (id: string) => void;
}

export const useMediaStore = create<MediaState>()(
  persist(
    (set, get) => ({
      columns: 3,
      rows: 2,
      slots: emptySlots(),
      savedLayouts: [],
      setSlotItem: (index, itemId) =>
        set((s) => ({
          slots: s.slots.map((sl) =>
            sl.index === index ? { ...sl, itemId, playing: false } : sl,
          ),
        })),
      clearSlot: (index) =>
        set((s) => ({
          slots: s.slots.map((sl) =>
            sl.index === index ? { ...sl, itemId: null, playing: false } : sl,
          ),
        })),
      clearAll: () => set((s) => ({ slots: emptySlots(s.columns * s.rows) })),
      setSlotPlaying: (index, playing) =>
        set((s) => ({
          slots: s.slots.map((sl) => (sl.index === index ? { ...sl, playing } : sl)),
        })),
      setSlotMuted: (index, muted) =>
        set((s) => ({
          slots: s.slots.map((sl) => (sl.index === index ? { ...sl, muted } : sl)),
        })),
      setSlotVolume: (index, volume) =>
        set((s) => ({
          slots: s.slots.map((sl) => (sl.index === index ? { ...sl, volume } : sl)),
        })),
      playAll: () =>
        set((s) => ({
          slots: s.slots.map((sl) => (sl.itemId ? { ...sl, playing: true } : sl)),
        })),
      pauseAll: () =>
        set((s) => ({ slots: s.slots.map((sl) => ({ ...sl, playing: false })) })),
      muteAll: (muted) =>
        set((s) => ({ slots: s.slots.map((sl) => ({ ...sl, muted })) })),
      setGrid: (columns, rows) => {
        const count = columns * rows;
        const current = get().slots;
        const next = emptySlots(count).map((sl, i) => current[i] ?? sl);
        set({ columns, rows, slots: next });
      },
      saveLayout: (name) =>
        set((s) => ({
          savedLayouts: [
            ...s.savedLayouts,
            {
              id: `layout-${Date.now()}`,
              name,
              columns: s.columns,
              rows: s.rows,
              slots: s.slots.map((sl) => sl.itemId),
              savedAt: Date.now(),
            },
          ],
        })),
      restoreLayout: (id) =>
        set((s) => {
          const layout = s.savedLayouts.find((l) => l.id === id);
          if (!layout) return s;
          const slots = emptySlots(layout.columns * layout.rows).map((sl, i) => ({
            ...sl,
            itemId: layout.slots[i] ?? null,
          }));
          return { columns: layout.columns, rows: layout.rows, slots };
        }),
      deleteLayout: (id) =>
        set((s) => ({ savedLayouts: s.savedLayouts.filter((l) => l.id !== id) })),
    }),
    {
      name: "nexus-media-workspace",
      // Do not persist playing state (privacy + avoids autoplay on restore).
      partialize: (s) => ({
        columns: s.columns,
        rows: s.rows,
        savedLayouts: s.savedLayouts,
        slots: s.slots.map((sl) => ({ ...sl, playing: false })),
      }),
    },
  ),
);
