import type { Game, GameAchievements, GameDetails, ProviderHealth, SteamStatus } from "@/core/types";

/**
 * Abstraction over a game library + achievements source. Method shapes mirror
 * the Steam Web API so a real implementation can drop in without UI changes.
 *
 * NOTE: Implementations must NOT scrape Steam HTML. Use the official Web API
 * with a user-provided API key stored via OS secure storage.
 */
export interface SteamProvider {
  readonly id: string;
  getGames(): Promise<readonly Game[]>;
  getGameDetails(gameId: string): Promise<GameDetails | null>;
  getAchievements(gameId: string): Promise<GameAchievements | null>;
  /**
   * Launch a game via its launcher. Returns true if the launch command was
   * issued. On the dev laptop the mock provider only simulates this.
   */
  launchGame(gameId: string): Promise<boolean>;
  /** Optional: installation/config status for Settings → Integrations. */
  getStatus?(): Promise<SteamStatus>;
  health?(): Promise<ProviderHealth>;
  /** Optional: safe session probe (process under the install folder). */
  isGameRunning?(gameId: string): Promise<boolean>;
  invalidate?(): void;
}
