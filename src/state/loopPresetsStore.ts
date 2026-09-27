import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isObj, safeStorage, vArr } from "./persistence";
import type { LoopPreset } from "@/core/types";

interface LoopPresetsState {
  presets: LoopPreset[];
  save: (preset: Omit<LoopPreset, "id" | "createdAt">) => LoopPreset;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  forItem: (itemId: string) => LoopPreset[];
  /** Privacy: drop every preset belonging to a revoked root. */
  purgeRoot: (rootId: string) => void;
  clear: () => void;
}

const LIMIT = 500;

/**
 * Saved A–B segments, keyed by the file's hashed id (never a filename). Purged
 * when the owning media root is revoked or the private workspace is cleared.
 */
export const useLoopPresetsStore = create<LoopPresetsState>()(
  persist(
    (set, get) => ({
      presets: [],
      save: (p) => {
        const preset: LoopPreset = { ...p, name: p.name.trim().slice(0, 60) || "Segment", id: `lp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, createdAt: Date.now() };
        set((s) => ({ presets: [...s.presets, preset].slice(-LIMIT) }));
        return preset;
      },
      rename: (id, name) => set((s) => ({ presets: s.presets.map((p) => (p.id === id ? { ...p, name: name.trim().slice(0, 60) || p.name } : p)) })),
      remove: (id) => set((s) => ({ presets: s.presets.filter((p) => p.id !== id) })),
      forItem: (itemId) => get().presets.filter((p) => p.itemId === itemId),
      purgeRoot: (rootId) => set((s) => ({ presets: s.presets.filter((p) => p.rootId !== rootId) })),
      clear: () => set({ presets: [] }),
    }),
    {
      name: "nexus-loop-presets",
      storage: safeStorage(),
      merge: (persisted, current) => ({
        ...current,
        presets: vArr(
          (persisted as { presets?: unknown } | undefined)?.presets,
          (x): x is LoopPreset => isObj(x) && typeof x.id === "string" && typeof x.itemId === "string" && typeof x.name === "string" && typeof x.a === "number" && typeof x.b === "number" && x.b > x.a,
          [],
          LIMIT,
        ),
      }),
    },
  ),
);
