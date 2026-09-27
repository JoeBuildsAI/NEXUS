import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isStr, safeStorage, vArr, vBool } from "./persistence";

interface InsightPrefsState {
  /** Insight ids the user dismissed. Cleared when the underlying state changes materially (see reset). */
  dismissed: string[];
  enabled: boolean;
  dismiss: (id: string) => void;
  reset: () => void;
  setEnabled: (v: boolean) => void;
}

/** Suggestions are dismissible and must not nag; dismissals persist locally. */
export const useInsightPrefsStore = create<InsightPrefsState>()(
  persist(
    (set) => ({
      dismissed: [],
      enabled: true,
      dismiss: (id) => set((s) => ({ dismissed: [...new Set([...s.dismissed, id])].slice(-50) })),
      reset: () => set({ dismissed: [] }),
      setEnabled: (enabled) => set({ enabled }),
    }),
    {
      name: "nexus-insight-prefs",
      storage: safeStorage(),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as { dismissed?: unknown; enabled?: unknown };
        return { ...current, dismissed: vArr(p.dismissed, isStr, [], 50), enabled: vBool(p.enabled, true) };
      },
    },
  ),
);
