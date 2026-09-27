import { create } from "zustand";
import type { TelemetrySnapshot } from "@/core/types";
import { getProviders } from "@/providers";

interface TelemetryState {
  snapshot: TelemetrySnapshot | null;
  /** Short rolling history for charts (memory only, never persisted). */
  history: TelemetrySnapshot[];
  polling: boolean;
  error: string | null;
  consecutiveFailures: number;
  start: (intervalMs?: number) => void;
  stop: () => void;
}

let timer: ReturnType<typeof setInterval> | null = null;
const HISTORY_LIMIT = 60;

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  snapshot: null,
  history: [],
  polling: false,
  error: null,
  consecutiveFailures: 0,
  start: (intervalMs = 1500) => {
    if (get().polling) return;
    const provider = getProviders().system;
    const poll = async () => {
      if (document.hidden) return; // don't burn cycles when not visible
      try {
        const snapshot = await provider.getTelemetry();
        set((s) => ({
          snapshot,
          error: null,
          consecutiveFailures: 0,
          history: [...s.history, snapshot].slice(-HISTORY_LIMIT),
        }));
      } catch (err) {
        set((s) => {
          const failures = s.consecutiveFailures + 1;
          // Drop the stale snapshot after a few failures so the UI shows "unavailable".
          return {
            error: String((err as Error)?.message ?? err),
            consecutiveFailures: failures,
            snapshot: failures >= 3 ? null : s.snapshot,
            history: failures >= 3 ? [] : s.history,
          };
        });
      }
    };
    set({ polling: true });
    void poll();
    timer = setInterval(poll, intervalMs);
  },
  stop: () => {
    if (timer) clearInterval(timer);
    timer = null;
    set({ polling: false });
  },
}));
