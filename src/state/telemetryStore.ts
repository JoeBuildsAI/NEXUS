import { create } from "zustand";
import type { TelemetrySnapshot } from "@/core/types";
import { getProviders } from "@/providers";

interface TelemetryState {
  snapshot: TelemetrySnapshot | null;
  /** Short rolling history for sparklines. */
  history: TelemetrySnapshot[];
  polling: boolean;
  start: (intervalMs?: number) => void;
  stop: () => void;
}

let timer: ReturnType<typeof setInterval> | null = null;
const HISTORY_LIMIT = 60;

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  snapshot: null,
  history: [],
  polling: false,
  start: (intervalMs = 1500) => {
    if (get().polling) return;
    const provider = getProviders().system;
    const poll = async () => {
      try {
        const snapshot = await provider.getTelemetry();
        set((s) => ({
          snapshot,
          history: [...s.history, snapshot].slice(-HISTORY_LIMIT),
        }));
      } catch (err) {
        console.warn("[telemetry] poll failed", err);
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
