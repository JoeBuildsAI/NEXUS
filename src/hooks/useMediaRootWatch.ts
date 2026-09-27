import { useEffect, useRef } from "react";
import { getProviders } from "@/providers";
import { useMediaLibraryStore } from "@/state/mediaLibraryStore";
import { useMediaStore } from "@/state/mediaStore";
import { notify } from "@/state/toastStore";
import { createLogger } from "@/lib/logger";

const log = createLogger("media");
const INTERVAL_MS = 8000;

/**
 * Removable-drive resilience. While the Media screen is open, re-validate every
 * authorized root on a slow cadence. When a root disappears: pause its players
 * and mark it unreachable (tiles show DRIVE DISCONNECTED). When it returns, the
 * root is re-registered natively (the same canonical path must exist again) and
 * the user is offered a resume — nothing auto-plays. Logs carry counts only.
 */
export function useMediaRootWatch(active: boolean) {
  const lastState = useRef<Record<string, boolean>>({});
  useEffect(() => {
    if (!active) return;
    const provider = getProviders().media;
    if (!provider.refreshRoots) return;
    let cancelled = false;
    const tick = async () => {
      const before = Object.fromEntries(useMediaLibraryStore.getState().roots.map((r) => [r.id, r.exists !== false]));
      try {
        await provider.refreshRoots!();
      } catch (err) {
        log.warn("root refresh failed", { error: String(err) });
        return;
      }
      if (cancelled) return;
      const after = useMediaLibraryStore.getState().roots;
      const files = useMediaLibraryStore.getState().files;
      for (const r of after) {
        const was = lastState.current[r.id] ?? before[r.id] ?? true;
        const now = r.exists !== false;
        if (was && !now) {
          // Pause every player whose file lives on this root.
          const ids = new Set(files.filter((f) => f.rootId === r.id).map((f) => f.id));
          const media = useMediaStore.getState();
          let paused = 0;
          for (const sl of media.slots) if (sl.itemId && ids.has(sl.itemId) && sl.playing) { media.setSlotPlaying(sl.index, false); paused++; }
          notify.warn("Media source disconnected", paused ? `${paused} player${paused === 1 ? "" : "s"} paused. Reconnect the drive to resume.` : "Reconnect the drive to resume.");
          log.info("media root disconnected", { pausedPlayers: paused });
        } else if (!was && now) {
          notify.success("Media source reconnected", "Press play to resume — nothing restarts on its own.");
          log.info("media root reconnected");
        }
        lastState.current[r.id] = now;
      }
    };
    void tick();
    const id = setInterval(() => void tick(), INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [active]);
}
