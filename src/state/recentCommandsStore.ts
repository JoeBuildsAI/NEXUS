import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isObj, safeStorage, vArr } from "./persistence";
import type { AssistantMatch } from "@/providers/assistant/AssistantProvider";

export type RecentCommand = Omit<AssistantMatch, "confidence"> & { usedAt: number };

interface RecentCommandsState {
  recents: RecentCommand[];
  record: (m: AssistantMatch) => void;
  clear: () => void;
}

const LIMIT = 6;

export const useRecentCommandsStore = create<RecentCommandsState>()(
  persist(
    (set) => ({
      recents: [],
      record: (m) =>
        set((s) => {
          const key = `${m.actionId}:${JSON.stringify(m.args)}`;
          const rest = s.recents.filter((r) => `${r.actionId}:${JSON.stringify(r.args)}` !== key);
          const { confidence: _c, ...entry } = m;
          return { recents: [{ ...entry, usedAt: Date.now() }, ...rest].slice(0, LIMIT) };
        }),
      clear: () => set({ recents: [] }),
    }),
    {
      name: "nexus-recent-commands",
      storage: safeStorage(),
      merge: (persisted, current) => ({
        ...current,
        recents: vArr((persisted as { recents?: unknown } | undefined)?.recents, (x): x is RecentCommand => isObj(x) && typeof x.actionId === "string" && typeof x.label === "string", [], 20),
      }),
    },
  ),
);
