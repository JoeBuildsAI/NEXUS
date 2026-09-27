import type { Game, GameAchievements, GameDetails, ProviderHealth, SteamStatus } from "@/core/types";
import { DEMO_GAMES } from "@/core/demo/games";
import { ProviderOfflineError } from "@/core/errors";
import { useDevStore } from "@/state/devStore";
import type { SteamProvider } from "./SteamProvider";

export class MockSteamProvider implements SteamProvider {
  readonly id = "mock-steam";

  private guard() {
    if (!useDevStore.getState().steamConnected) {
      throw new ProviderOfflineError("Steam", "Steam is offline (simulated)");
    }
  }

  async getGames(): Promise<readonly Game[]> {
    this.guard();
    // Strip detail-only fields; return the library view.
    return DEMO_GAMES.map(({ achievements: _a, summary: _s, developer: _d, publisher: _p, ...g }) => g);
  }

  async getGameDetails(gameId: string): Promise<GameDetails | null> {
    this.guard();
    return DEMO_GAMES.find((g) => g.id === gameId) ?? null;
  }

  async getAchievements(gameId: string): Promise<GameAchievements | null> {
    this.guard();
    return DEMO_GAMES.find((g) => g.id === gameId)?.achievements ?? null;
  }

  async launchGame(gameId: string): Promise<boolean> {
    this.guard();
    const game = DEMO_GAMES.find((g) => g.id === gameId);
    if (!game) return false;
    console.info(`[MockSteamProvider] Simulating launch of "${game.title}"`);
    return true;
  }

  async getStatus(): Promise<SteamStatus> {
    return { detected: false, steamPath: null, libraries: 0, installedGames: 0, apiConfigured: false, steamIdConfigured: false, malformedManifests: 0 };
  }

  async health(): Promise<ProviderHealth> {
    const ok = useDevStore.getState().steamConnected;
    return { state: ok ? "not-configured" : "unavailable", summary: ok ? "Demo library · Steam not connected" : "Offline (simulated)", checkedAt: Date.now() };
  }

  async mode(): Promise<"real" | "demo"> {
    return "demo";
  }
}
