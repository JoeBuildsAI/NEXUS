import { useEffect } from "react";
import { config } from "@/core/config";
import { useLibraryStore } from "@/state/libraryStore";
import { useGameSessionStore } from "@/state/gameSessionStore";
import { useModeStore } from "@/state/modeStore";
import { createLogger } from "@/lib/logger";

const log = createLogger("session");
const POLL_MS = 20_000;

/** Install folders worth probing: installed library games with a known path. */
export function probeDirs(games: readonly { installed: boolean; installPath?: string | null }[]): string[] {
  return [...new Set(games.filter((g) => g.installed && g.installPath && g.installPath.length > 6).map((g) => g.installPath!))].slice(0, 300);
}

/**
 * Games started outside NEXUS (Steam, the Xbox app, a shortcut) also get the
 * reduced footprint: a read-only process probe of discovered install folders.
 * Never touches the game; defers to a NEXUS-launched session when one exists.
 */
export function useExternalGameWatch() {
  useEffect(() => {
    if (!config.isTauri) return;
    let external = false;
    const tick = async () => {
      if (useGameSessionStore.getState().phase !== "idle") return;
      const dirs = probeDirs(useLibraryStore.getState().games);
      if (!dirs.length) return;
      const { invoke } = await import("@tauri-apps/api/core");
      const running = await invoke<string[]>("processes_running_under", { dirs }).catch(() => null);
      if (running == null) return;
      const now = running.length > 0;
      if (now !== external) {
        external = now;
        useModeStore.getState().setGameRunning(now);
        log.info(now ? "Game running outside NEXUS — footprint reduced" : "External game closed", { count: running.length });
      }
    };
    const id = setInterval(() => void tick(), POLL_MS);
    const first = setTimeout(() => void tick(), 8000);
    return () => { clearInterval(id); clearTimeout(first); };
  }, []);
}
