import type { Achievement, GameDetails } from "@/core/types";
import { completionPercent } from "@/core/types";

export type CompletionBucket = "completed" | "near" | "in-progress" | "not-started" | "unknown";

export function bucketFor(g: GameDetails): CompletionBucket {
  const a = g.achievements;
  if (a.status && a.status !== "ok" && a.status !== "demo" && a.total === 0) return "unknown";
  if (a.total === 0) return "unknown";
  const p = completionPercent(a);
  if (p === 100) return "completed";
  if (p >= 70) return "near";
  if (a.unlocked === 0) return "not-started";
  return "in-progress";
}

export interface ClosestEntry {
  achievement: Achievement;
  /** Why this is suggested — always transparent, never invented progress. */
  reason: "tracked" | "most-common" | "rare";
}

/**
 * "Closest" achievements. Steam does not expose per-achievement progress for
 * most titles, so this uses only transparent signals:
 *  1. an achievement the user explicitly tracks,
 *  2. locked achievements with the highest global unlock rate (most players get
 *     these next),
 *  3. optionally one rare achievement as a stretch goal.
 */
export function closestAchievements(g: GameDetails, trackedId: string | null, limit = 3): ClosestEntry[] {
  const locked = g.achievements.achievements.filter((a) => !a.unlocked);
  const out: ClosestEntry[] = [];
  const tracked = trackedId ? locked.find((a) => a.id === trackedId) : undefined;
  if (tracked) out.push({ achievement: tracked, reason: "tracked" });
  const byCommon = [...locked].filter((a) => a.id !== trackedId && a.globalPercent != null && !a.hidden).sort((a, b) => (b.globalPercent ?? 0) - (a.globalPercent ?? 0));
  for (const a of byCommon) {
    if (out.length >= limit) break;
    out.push({ achievement: a, reason: "most-common" });
  }
  return out.slice(0, limit);
}

export function recentUnlocks(g: GameDetails, limit = 5): Achievement[] {
  return [...g.achievements.achievements].filter((a) => a.unlocked && a.unlockedAt).sort((a, b) => (b.unlockedAt ?? 0) - (a.unlockedAt ?? 0)).slice(0, limit);
}

export function libraryTotals(games: readonly GameDetails[]) {
  const withData = games.filter((g) => g.achievements.total > 0);
  return {
    games: games.length,
    installed: games.filter((g) => g.installed).length,
    hours: Math.round(games.reduce((s, g) => s + g.playtimeMinutes, 0) / 60),
    unlocked: withData.reduce((s, g) => s + g.achievements.unlocked, 0),
    total: withData.reduce((s, g) => s + g.achievements.total, 0),
    completed: withData.filter((g) => bucketFor(g) === "completed").length,
    near: withData.filter((g) => bucketFor(g) === "near").length,
  };
}
