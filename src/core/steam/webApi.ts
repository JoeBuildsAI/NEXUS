import type { Achievement, GameAchievements } from "@/core/types";

/** Raw proxy response shape from the native layer (steam_api.rs). */
export interface ApiResponse {
  status: "ok" | "not-configured" | "network-error" | "http-error";
  httpStatus: number;
  body: string;
  cached: boolean;
}

export type AchievementStatus =
  | "ok"
  | "not-configured"
  | "private-profile"
  | "no-achievements"
  | "network-error"
  | "api-error";

export interface SchemaAchievement {
  apiName: string;
  displayName: string;
  description: string;
  icon: string | null;
  iconGray: string | null;
  hidden: boolean;
}

export interface PlayerAchievement {
  apiName: string;
  achieved: boolean;
  unlockTime: number | null;
}

export interface OwnedGame {
  appId: number;
  name: string;
  playtimeMinutes: number;
  lastPlayed: number | null;
}

function safeJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export function parseSchema(body: string): SchemaAchievement[] | null {
  const j = safeJson(body) as { game?: { availableGameStats?: { achievements?: Array<Record<string, unknown>> } } } | null;
  const list = j?.game?.availableGameStats?.achievements;
  if (!Array.isArray(list)) return j?.game ? [] : null;
  return list
    .filter((a) => typeof a.name === "string")
    .map((a) => ({
      apiName: String(a.name),
      displayName: String(a.displayName ?? a.name),
      description: String(a.description ?? ""),
      icon: typeof a.icon === "string" ? a.icon : null,
      iconGray: typeof a.icongray === "string" ? a.icongray : null,
      hidden: Number(a.hidden ?? 0) === 1,
    }));
}

export function parsePlayerAchievements(body: string): { status: "ok" | "private-profile" | "no-achievements" | "api-error"; achievements: PlayerAchievement[] } {
  const j = safeJson(body) as { playerstats?: { success?: boolean; error?: string; achievements?: Array<Record<string, unknown>> } } | null;
  const ps = j?.playerstats;
  if (!ps) return { status: "api-error", achievements: [] };
  if (ps.success === false) {
    const err = (ps.error ?? "").toLowerCase();
    if (err.includes("not public") || err.includes("private")) return { status: "private-profile", achievements: [] };
    if (err.includes("no stats") || err.includes("requested app has no stats")) return { status: "no-achievements", achievements: [] };
    return { status: "api-error", achievements: [] };
  }
  const list = Array.isArray(ps.achievements) ? ps.achievements : [];
  if (list.length === 0) return { status: "no-achievements", achievements: [] };
  return {
    status: "ok",
    achievements: list.map((a) => ({
      apiName: String(a.apiname),
      achieved: Number(a.achieved) === 1,
      unlockTime: Number(a.unlocktime) > 0 ? Number(a.unlocktime) * 1000 : null,
    })),
  };
}

export function parseGlobalPercentages(body: string): Map<string, number> {
  const j = safeJson(body) as { achievementpercentages?: { achievements?: Array<{ name?: string; percent?: number | string }> } } | null;
  const m = new Map<string, number>();
  for (const a of j?.achievementpercentages?.achievements ?? []) {
    if (a.name) m.set(a.name, Number(a.percent) || 0);
  }
  return m;
}

export function parseOwnedGames(body: string): Map<number, OwnedGame> {
  const j = safeJson(body) as { response?: { games?: Array<Record<string, unknown>> } } | null;
  const m = new Map<number, OwnedGame>();
  for (const g of j?.response?.games ?? []) {
    const appId = Number(g.appid);
    if (!appId) continue;
    m.set(appId, {
      appId,
      name: String(g.name ?? ""),
      playtimeMinutes: Number(g.playtime_forever ?? 0) || 0,
      lastPlayed: Number(g.rtime_last_played) > 0 ? Number(g.rtime_last_played) * 1000 : null,
    });
  }
  return m;
}

/** Merge schema + player + global rarity into the app's achievement model. */
export function mergeAchievements(gameId: string, schema: SchemaAchievement[], player: PlayerAchievement[], global: Map<string, number>): GameAchievements {
  const byApi = new Map(player.map((p) => [p.apiName, p]));
  const achievements: Achievement[] = schema.map((s) => {
    const p = byApi.get(s.apiName);
    return {
      id: `${gameId}:${s.apiName}`,
      name: s.displayName,
      description: s.description,
      unlocked: p?.achieved ?? false,
      unlockedAt: p?.unlockTime ?? null,
      globalPercent: global.has(s.apiName) ? Math.round((global.get(s.apiName) ?? 0) * 10) / 10 : null,
      iconUrl: (p?.achieved ? s.icon : s.iconGray) ?? s.icon,
      hidden: s.hidden,
    };
  });
  return {
    gameId,
    unlocked: achievements.filter((a) => a.unlocked).length,
    total: achievements.length,
    achievements,
  };
}

/** Translate a proxy transport status into the achievement status vocabulary. */
export function transportStatus(r: ApiResponse): AchievementStatus | null {
  if (r.status === "not-configured") return "not-configured";
  if (r.status === "network-error") return "network-error";
  if (r.status === "http-error") return r.httpStatus === 403 ? "private-profile" : "api-error";
  return null;
}
