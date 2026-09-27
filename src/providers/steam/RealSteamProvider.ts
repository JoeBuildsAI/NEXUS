import type { Game, GameAchievements, GameDetails } from "@/core/types";
import type { SteamProvider } from "./SteamProvider";

/**
 * RealSteamProvider — documented stub.
 *
 * Steam is not available on the development laptop, so this is intentionally a
 * stub that describes the intended integration. It is wired into the factory but
 * only selected when VITE_PROVIDER_STEAM=real.
 *
 * Intended implementation (on Joseph's gaming PC):
 *  1. Detect the local Steam install (registry: HKCU\Software\Valve\Steam,
 *     SteamPath) via a Rust command — never scrape HTML.
 *  2. Read owned games from the Steam Web API (IPlayerService/GetOwnedGames)
 *     using a user-provided API key from OS secure storage (never committed).
 *  3. Read achievements via ISteamUserStats/GetPlayerAchievements and global
 *     rarity via GetGlobalAchievementPercentagesForApp.
 *  4. Resolve local install state + sizes from libraryfolders.vdf / appmanifest.
 *  5. launchGame() shells out to `steam://rungameid/<appid>` via the shell
 *     plugin, mapped to an explicit predefined command.
 *
 * See docs/GAMING_PC_SETUP.md and docs/PROVIDERS.md.
 */
export class RealSteamProvider implements SteamProvider {
  readonly id = "real-steam";

  private notImplemented(method: string): never {
    throw new Error(
      `RealSteamProvider.${method}() is not implemented on this machine. ` +
        `Set VITE_PROVIDER_STEAM=mock or complete Steam integration on the gaming PC.`,
    );
  }

  async getGames(): Promise<readonly Game[]> {
    this.notImplemented("getGames");
  }

  async getGameDetails(_gameId: string): Promise<GameDetails | null> {
    this.notImplemented("getGameDetails");
  }

  async getAchievements(_gameId: string): Promise<GameAchievements | null> {
    this.notImplemented("getAchievements");
  }

  async launchGame(gameId: string): Promise<boolean> {
    // The launch path is safe to implement even without the Web API, via the
    // Steam URL protocol. Kept behind the stub until Steam detection lands.
    void gameId;
    this.notImplemented("launchGame");
  }
}
