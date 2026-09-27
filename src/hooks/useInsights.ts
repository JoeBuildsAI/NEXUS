import { useEffect, useMemo, useState } from "react";
import { generateInsights, type Insight } from "@/core/insights/insightEngine";
import { useTelemetryStore } from "@/state/telemetryStore";
import { useModeStore } from "@/state/modeStore";
import { useProcessPrefsStore } from "@/state/processPrefsStore";
import { useDevStore } from "@/state/devStore";
import { useGamePrefsStore } from "@/state/gamePrefsStore";
import { useGameSessionStore } from "@/state/gameSessionStore";
import { useLibraryStore } from "@/state/libraryStore";
import { useCleanupStore } from "@/state/cleanupStore";
import { useInsightPrefsStore } from "@/state/insightPrefsStore";
import { getProviders } from "@/providers";
import type { InboxSummary } from "@/core/types";

/**
 * Assistant presence: deterministic insights derived from live provider data.
 * Uses the cached library (no per-game fetch storm) and real cleanup discovery.
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
  const libraryDetails = useLibraryStore((s) => s.details);
  const libraryGames = useLibraryStore((s) => s.games);
  const libraryOffline = useLibraryStore((s) => s.offline);
  const candidates = useCleanupStore((s) => s.candidates);
  const dismissed = useInsightPrefsStore((s) => s.dismissed);
  const historyEnabled = useInsightPrefsStore((s) => s.enabled);
  const [inbox, setInbox] = useState<InboxSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    getProviders().email.getSummary(Date.now() - 3 * 24 * 3600 * 1000).then((s) => !cancelled && setInbox(s)).catch(() => !cancelled && setInbox(null));
    return () => { cancelled = true; };
  }, [emailPulse]);

  useEffect(() => {
    void useLibraryStore.getState().load();
  }, [steamConnected, achievementPulse]);

  const games = useMemo(
    () => libraryGames.map((g) => libraryDetails[g.id]?.value ?? { ...g, achievements: { gameId: g.id, unlocked: 0, total: 0, achievements: [], status: "not-configured" as const }, summary: "", developer: "", publisher: "" }),
    [libraryDetails, libraryGames],
  );
  const approvedAppCount = Object.values(prefs).filter((p) => p === "close").length;
  const tracked = useGamePrefsStore((s) => s.tracked[0] ?? null);
  const sessionTitle = useGameSessionStore((s) => (s.phase === "active" ? s.title : null));

  return useMemo(() => {
    if (!historyEnabled) return [];
    const all = generateInsights({
      telemetry: snapshot,
      games,
      inbox,
      cleanup: (candidates ?? []).map((c) => ({ id: c.id, label: c.label, description: c.description, bytes: c.bytes, risk: c.risk, category: "temporary" as const, approved: false })),
      approvedAppCount,
      mode,
      steamConnected: steamConnected && !libraryOffline,
      mediaConnected,
      tracked,
      gameSession: sessionTitle ? { title: sessionTitle } : null,
    });
    return all.filter((i) => !dismissed.includes(i.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [health, snapshot?.memory.usagePercent && Math.round(snapshot.memory.usagePercent / 5), games, inbox, candidates, approvedAppCount, mode, steamConnected, libraryOffline, mediaConnected, tracked, sessionTitle, dismissed, historyEnabled]);
}
