import type { Game, GameAchievements, GameDetails } from "@/core/types";
import { DEMO_GAMES } from "@/core/demo/games";
import type { SteamProvider } from "./SteamProvider";

export class MockSteamProvider implements SteamProvider {
  readonly id = "mock-steam";

  async getGames(): Promise<readonly Game[]> {
    // Strip detail-only fields; return the library view.
    return DEMO_GAMES.map(({ achievements: _a, summary: _s, developer: _d, publisher: _p, ...g }) => g);
  }

  async getGameDetails(gameId: string): Promise<GameDetails | null> {
    return DEMO_GAMES.find((g) => g.id === gameId) ?? null;
  }

  async getAchievements(gameId: string): Promise<GameAchievements | null> {
    return DEMO_GAMES.find((g) => g.id === gameId)?.achievements ?? null;
  }

  async launchGame(gameId: string): Promise<boolean> {
    const game = DEMO_GAMES.find((g) => g.id === gameId);
    if (!game) return false;
    console.info(`[MockSteamProvider] Simulating launch of "${game.title}"`);
    return true;
  }
}
