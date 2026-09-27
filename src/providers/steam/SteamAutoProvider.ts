import type { Game, GameAchievements, GameDetails, ProviderHealth, SteamStatus } from "@/core/types";
import type { SteamProvider } from "./SteamProvider";
import type { RealSteamProvider } from "./RealSteamProvider";
import type { MockSteamProvider } from "./MockSteamProvider";

/**
 * Real-first Steam provider with graceful demo fallback.
 *
 * On a machine where Steam is detected, everything routes to RealSteamProvider.
 * Where it is not (dev laptop, fresh PC), the demo library is served so NEXUS
 * still looks complete — and the UI labels it as demo via `mode`.
 */
export class SteamAutoProvider implements SteamProvider {
  readonly id = "auto-steam";
  private resolved: { at: number; useReal: boolean } | null = null;

  constructor(private real: RealSteamProvider, private mock: MockSteamProvider, private allowDemoFallback: boolean) {}

  /** "real" | "demo" — which backing library is active right now. */
  async mode(): Promise<"real" | "demo"> {
    return (await this.pick()) === this.real ? "real" : "demo";
  }

  private async pick(): Promise<SteamProvider> {
    if (this.resolved && Date.now() - this.resolved.at < 60_000) return this.resolved.useReal ? this.real : this.mock;
    const d = await this.real.discover();
    const useReal = d.detected || !this.allowDemoFallback;
    this.resolved = { at: Date.now(), useReal };
    return useReal ? this.real : this.mock;
  }

  async getGames(): Promise<readonly Game[]> {
    return (await this.pick()).getGames();
  }
  async getGameDetails(gameId: string): Promise<GameDetails | null> {
    return (await this.pick()).getGameDetails(gameId);
  }
  async getAchievements(gameId: string): Promise<GameAchievements | null> {
    return (await this.pick()).getAchievements(gameId);
  }
  async launchGame(gameId: string): Promise<boolean> {
    return (await this.pick()).launchGame(gameId);
  }
  async isGameRunning(gameId: string): Promise<boolean> {
    const p = await this.pick();
    return p.isGameRunning ? p.isGameRunning(gameId) : false;
  }
  async getStatus(): Promise<SteamStatus> {
    return this.real.getStatus();
  }
  async health(): Promise<ProviderHealth> {
    const h = await this.real.health();
    if (h.state === "unavailable" && this.allowDemoFallback) {
      return { ...h, state: "not-configured", summary: "Steam not detected · using demo library" };
    }
    return h;
  }
  invalidate(): void {
    this.resolved = null;
    this.real.invalidate();
  }
}
