import { useEffect, useMemo, useState } from "react";
import { generateInsights, type Insight } from "@/core/insights/insightEngine";
import { useTelemetryStore } from "@/state/telemetryStore";
import { useModeStore } from "@/state/modeStore";
import { useProcessPrefsStore } from "@/state/processPrefsStore";
import { useDevStore } from "@/state/devStore";
import { getProviders } from "@/providers";
import { DEMO_CLEANUP_CANDIDATES } from "@/core/demo/storage";
import type { GameDetails, InboxSummary } from "@/core/types";

/**
 * Assistant presence: deterministic insights derived from live provider data.
 * Refreshes when telemetry health changes, mode changes, or dev sim toggles.
 */
export function useInsights(): Insight[] {
  const health = useTelemetryStore((s) => s.snapshot?.health);
  const snapshot = useTelemetryStore((s) => s.snapshot);
  const mode = useModeStore((s) => s.current);
  const prefs = useProcessPrefsStore((s) => s.prefs);
  const steamConnected = useDevStore((s) => s.steamConnected);
  const mediaConnected = useDevStore((s) => s.mediaConnected);
  const emailPulse = useDevStore((s) => s.emailPulse);
  const achievementPulse = useDevStore((s) => s.achievementPulse);
  const [games, setGames] = useState<readonly GameDetails[]>([]);
  const [inbox, setInbox] = useState<InboxSummary | null>(null);

  useEffect(() => {
    const { steam, email } = getProviders();
    let cancelled = false;
    (async () => {
      try {
        const list = await steam.getGames();
        const details = await Promise.all(list.map((g) => steam.getGameDetails(g.id)));
        if (!cancelled) setGames(details.filter((d): d is GameDetails => d != null));
      } catch {
        if (!cancelled) setGames([]);
      }
      try {
        const s = await email.getSummary(Date.now() - 3 * 24 * 3600 * 1000);
        if (!cancelled) setInbox(s);
      } catch {
        if (!cancelled) setInbox(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [steamConnected, emailPulse, achievementPulse]);

  const approvedAppCount = Object.values(prefs).filter((p) => p === "suspend").length;

  return useMemo(
    () =>
      generateInsights({
        telemetry: snapshot,
        games,
        inbox,
        cleanup: DEMO_CLEANUP_CANDIDATES,
        approvedAppCount,
        mode,
        steamConnected,
        mediaConnected,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [health, snapshot?.memory.usagePercent && Math.round(snapshot.memory.usagePercent / 5), games, inbox, approvedAppCount, mode, steamConnected, mediaConnected],
  );
}
