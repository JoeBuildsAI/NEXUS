import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isObj, safeStorage, vArr } from "./persistence";

export interface StartupChange {
  id: string;
  name: string;
  previousEnabled: boolean;
  changedAt: number;
}

interface StartupChangesState {
  changes: StartupChange[];
  record: (c: Omit<StartupChange, "changedAt">) => void;
  forget: (id: string) => void;
  clear: () => void;
}

/** Every startup toggle NEXUS makes is recorded so it can be restored. */
export const useStartupChangesStore = create<StartupChangesState>()(
  persist(
    (set) => ({
      changes: [],
      record: (c) => set((s) => ({ changes: s.changes.some((x) => x.id === c.id) ? s.changes : [...s.changes, { ...c, changedAt: Date.now() }] })),
      forget: (id) => set((s) => ({ changes: s.changes.filter((c) => c.id !== id) })),
      clear: () => set({ changes: [] }),
    }),
    {
      name: "nexus-startup-changes",
      storage: safeStorage(),
      merge: (persisted, current) => ({
        ...current,
        changes: vArr((persisted as { changes?: unknown } | undefined)?.changes, (x): x is StartupChange => isObj(x) && typeof x.id === "string" && typeof x.name === "string" && typeof x.previousEnabled === "boolean", [], 100),
      }),
    },
  ),
);
