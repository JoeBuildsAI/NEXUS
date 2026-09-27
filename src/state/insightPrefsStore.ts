import { create } from "zustand";
import { persist } from "zustand/middleware";

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
    { name: "nexus-insight-prefs" },
  ),
);
