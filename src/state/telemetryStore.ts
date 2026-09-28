import { create } from "zustand";
import type { TelemetrySnapshot } from "@/core/types";
import { getProviders } from "@/providers";

/** Compact history point — a few numbers, never the whole snapshot. */
export interface TelemetryPoint {
  readonly t: number;
  readonly cpu: number;
  readonly memory: number;
  readonly gpu: number | null;
  readonly down: number;
  readonly up: number;
}

interface TelemetryState {
  snapshot: TelemetrySnapshot | null;
  /** Rolling history for charts (memory only, never persisted). ~10 min at 1.5 s. */
  history: TelemetryPoint[];
  polling: boolean;
  error: string | null;
  consecutiveFailures: number;
  start: (intervalMs?: number) => void;
  stop: () => void;
  /** Restart with the current cadence (e.g. after sleep). */
  restart: () => void;
}

let timer: ReturnType<typeof setInterval> | null = null;
let currentInterval = 1500;
const HISTORY_LIMIT = 400;
/** A gap this long (sleep, lock) resets the series instead of drawing a false flat line. */
const GAP_RESET_MS = 60_000;

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  snapshot: null,
  history: [],
  polling: false,
  error: null,
  consecutiveFailures: 0,
  start: (intervalMs = 1500) => {
    if (get().polling) return;
    currentInterval = intervalMs;
    const provider = getProviders().system;
    const poll = async () => {
      if (document.hidden) return; // don't burn cycles when not visible
      try {
        const snapshot = await provider.getTelemetry();
        const point: TelemetryPoint = { t: snapshot.timestamp || Date.now(), cpu: snapshot.cpu.usagePercent, memory: snapshot.memory.usagePercent, gpu: snapshot.gpu?.usagePercent ?? null, down: snapshot.network.downBytesPerSec, up: snapshot.network.upBytesPerSec };
        set((s) => {
          const last = s.history[s.history.length - 1];
          const base = last && point.t - last.t > GAP_RESET_MS ? [] : s.history;
          return { snapshot, error: null, consecutiveFailures: 0, history: [...base, point].slice(-HISTORY_LIMIT) };
        });
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
  restart: () => {
    get().stop();
    get().start(currentInterval);
  },
}));
