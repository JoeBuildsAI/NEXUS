import type { Game, GameAchievements, GameDetails, ProviderHealth, SteamStatus } from "@/core/types";
import { createLogger } from "@/lib/logger";

const log = createLogger("steam");
import { DEMO_GAMES } from "@/core/demo/games";
import { ProviderOfflineError } from "@/core/errors";
import { useDevStore } from "@/state/devStore";
import { syntheticGames } from "@/core/demo/synthetic";
import type { SteamProvider } from "./SteamProvider";

export class MockSteamProvider implements SteamProvider {
  readonly id = "mock-steam";
  private synthetic: { size: number; extreme: boolean; games: readonly GameDetails[] } | null = null;

  private guard() {
    const dev = useDevStore.getState();
    if (!dev.steamConnected) {
      throw new ProviderOfflineError("Steam", "Steam is offline (simulated)");
    }
    if (dev.providerExceptions) {
      throw new Error("Simulated provider exception: steam");
    }
  }

  /** Demo set, optionally extended with deterministic synthetic games (dev lab). */
  private all(): readonly GameDetails[] {
    const dev = useDevStore.getState();
    if (!dev.steamLibrarySize && !dev.extremeText) return DEMO_GAMES;
    const size = dev.steamLibrarySize || 0;
    if (!this.synthetic || this.synthetic.size !== size || this.synthetic.extreme !== dev.extremeText) {
      this.synthetic = { size, extreme: dev.extremeText, games: [...DEMO_GAMES, ...syntheticGames(size || 9, dev.extremeText)] };
    }
    return this.synthetic.games;
  }

  private withPrivacy(g: GameDetails): GameDetails {
    if (!useDevStore.getState().steamPrivateProfile) return g;
    return { ...g, achievements: { gameId: g.id, total: 0, unlocked: 0, status: "private-profile", achievements: [] } };
  }

  async getGames(): Promise<readonly Game[]> {
    this.guard();
    // Strip detail-only fields; return the library view.
    return this.all().map(({ achievements: _a, summary: _s, developer: _d, publisher: _p, ...g }) => g);
  }

  async getGameDetails(gameId: string): Promise<GameDetails | null> {
    this.guard();
    const g = this.all().find((x) => x.id === gameId);
    return g ? this.withPrivacy(g) : null;
  }

  async getAchievements(gameId: string): Promise<GameAchievements | null> {
    this.guard();
    const g = this.all().find((x) => x.id === gameId);
    return g ? this.withPrivacy(g).achievements : null;
  }

  async launchGame(gameId: string): Promise<boolean> {
    this.guard();
    const game = this.all().find((g) => g.id === gameId);
    if (!game) return false;
    log.debug("Simulating launch", { title: game.title });
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
