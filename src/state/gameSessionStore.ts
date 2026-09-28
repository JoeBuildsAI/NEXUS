import { create } from "zustand";
import { getProviders } from "@/providers";
import { useModeStore } from "./modeStore";
import { notify } from "./toastStore";
import { createLogger } from "@/lib/logger";
import { activity } from "./activityStore";
import { native } from "@/providers/system/nativeBridge";

const log = createLogger("session");

export type SessionPhase = "idle" | "launch-requested" | "active" | "exited";

interface GameSessionState {
  phase: SessionPhase;
  gameId: string | null;
  title: string | null;
  startedAt: number | null;
  /** Begin tracking after a launch request. */
  begin: (gameId: string, title: string) => void;
  /** Manually end (e.g. user says the game is closed). */
  end: () => void;
}

let timer: ReturnType<typeof setInterval> | null = null;
const DETECT_WINDOW_MS = 3 * 60_000;
const POLL_LAUNCH_MS = 4_000;
const POLL_ACTIVE_MS = 10_000;

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Steam asks its provider; other launchers (Xbox) use the discovered install folder. */
async function isRunning(gameId: string): Promise<boolean> {
  const steam = getProviders().steam;
  if (!gameId.startsWith("xbox:")) return steam.isGameRunning ? steam.isGameRunning(gameId).catch(() => false) : false;
  const { useLibraryStore } = await import("./libraryStore");
  const dir = useLibraryStore.getState().games.find((g) => g.id === gameId)?.installPath;
  return dir ? native.runningUnder(dir) : false;
}

/**
 * Tracks a launched game externally: after a launch request, NEXUS polls for a
 * process running under the game's install folder (read-only enumeration). No
 * injection, hooks, or overlays — NEXUS stays outside the game.
 */
export const useGameSessionStore = create<GameSessionState>((set, get) => ({
  phase: "idle",
  gameId: null,
  title: null,
  startedAt: null,

  begin: (gameId, title) => {
    stop();
    const requestedAt = Date.now();
    set({ phase: "launch-requested", gameId, title, startedAt: requestedAt });
    useModeStore.getState().setGameRunning(true);

    const probe = async () => {
      const running = await isRunning(gameId);
      const { phase } = get();
      if (phase === "launch-requested") {
        if (running) {
          set({ phase: "active", startedAt: Date.now() });
          log.info("Game session active", { gameId });
          stop();
          timer = setInterval(probe, POLL_ACTIVE_MS);
        } else if (Date.now() - requestedAt > DETECT_WINDOW_MS) {
          // Could not confirm (non-Steam launcher, demo, or slow start). Stop reducing footprint.
          set({ phase: "idle", gameId: null, title: null, startedAt: null });
          useModeStore.getState().setGameRunning(false);
          stop();
        }
      } else if (phase === "active" && !running) {
        const started = get().startedAt ?? Date.now();
        const mins = Math.max(1, Math.round((Date.now() - started) / 60_000));
        set({ phase: "exited" });
        useModeStore.getState().setGameRunning(false);
        stop();
        const dur = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
        notify.neutral("Session complete", `${title} · ${dur}`);
        activity.record("game-session-ended", `${title} · ${dur}`, { gameId });
        // One achievement refresh after the session — never during it, never repeatedly.
        void import("@/state/libraryStore").then(({ useLibraryStore }) => useLibraryStore.getState().refreshDetails(gameId));
        setTimeout(() => set({ phase: "idle", gameId: null, title: null, startedAt: null }), 1500);
      }
    };
    timer = setInterval(probe, POLL_LAUNCH_MS);
    void probe();
  },

  end: () => {
    stop();
    set({ phase: "idle", gameId: null, title: null, startedAt: null });
    useModeStore.getState().setGameRunning(false);
  },
}));
