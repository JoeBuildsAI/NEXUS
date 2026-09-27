/** Gaming domain models. Designed to map cleanly onto the Steam Web API. */

export type Launcher = "steam" | "epic" | "gog" | "xbox" | "standalone";

export interface Achievement {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly unlocked: boolean;
  readonly unlockedAt: number | null;
  /** Global unlock percentage across all players, 0-100 (rarity). */
  readonly globalPercent: number | null;
  readonly iconUrl: string | null;
  readonly hidden: boolean;
}

export interface Game {
  readonly id: string;
  readonly title: string;
  /** Steam AppID when applicable. */
  readonly steamAppId: number | null;
  readonly launcher: Launcher;
  readonly installed: boolean;
  readonly installSizeBytes: number | null;
  /** Total playtime in minutes. */
  readonly playtimeMinutes: number;
  readonly lastPlayed: number | null;
  readonly coverColor: string;
  readonly heroColor: string;
  readonly coverUrl: string | null;
  readonly heroUrl: string | null;
  readonly genres: readonly string[];
  /** Absolute install folder when known (used for safe game-session probing). */
  readonly installPath?: string | null;
}

export type AchievementSourceStatus =
  | "ok"
  | "not-configured"
  | "private-profile"
  | "no-achievements"
  | "network-error"
  | "api-error"
  | "demo";

export interface GameAchievements {
  readonly gameId: string;
  readonly unlocked: number;
  readonly total: number;
  readonly achievements: readonly Achievement[];
  /** Where the data came from / why it may be empty. Defaults to "ok". */
  readonly status?: AchievementSourceStatus;
}

export interface GameDetails extends Game {
  readonly achievements: GameAchievements;
  readonly summary: string;
  readonly developer: string;
  readonly publisher: string;
}

/** Aggregated view helpers computed from a Game + its achievements. */
export function completionPercent(a: {
  readonly unlocked: number;
  readonly total: number;
}): number {
  if (a.total <= 0) return 0;
  return Math.round((a.unlocked / a.total) * 100);
}
