import { invoke } from "@tauri-apps/api/core";
import type { Game, GameDetails } from "@/core/types";
import { config } from "@/core/config";
import { createLogger } from "@/lib/logger";

const log = createLogger("xbox");

export interface XboxInventory {
  xboxAppInstalled: boolean;
  roots: string[];
  games: { id: string; title: string; packageFamilyName: string | null; appId: string; installPath: string; installSizeBytes: number | null; logoDataUrl: string | null; storeId: string | null; publisher: string | null }[];
  capabilities: { discovery: boolean; launch: boolean; artwork: boolean; playtime: boolean; achievements: boolean; reason: string };
}

/**
 * Xbox / Microsoft Store PC games discovered locally from GDK manifests.
 * Capabilities are explicit: discovery, launch and artwork are real; playtime
 * and achievements are UNAVAILABLE (no Xbox Live access) and never invented.
 */
export class XboxGameProvider {
  readonly id = "xbox";
  private cache: { at: number; inv: XboxInventory } | null = null;

  async inventory(force = false): Promise<XboxInventory | null> {
    if (!config.isTauri) return null;
    if (!force && this.cache && Date.now() - this.cache.at < 60_000) return this.cache.inv;
    try {
      const inv = await invoke<XboxInventory>("xbox_inventory");
      this.cache = { at: Date.now(), inv };
      log.info("Xbox inventory", { games: inv.games.length, roots: inv.roots.length, app: inv.xboxAppInstalled });
      return inv;
    } catch (e) {
      log.warn("Xbox inventory failed", { error: String((e as Error)?.message ?? e).slice(0, 120) });
      return null;
    }
  }

  async getGames(): Promise<readonly Game[]> {
    const inv = await this.inventory();
    return (inv?.games ?? []).map((g) => ({
      id: g.id,
      title: g.title,
      steamAppId: null,
      launcher: "xbox" as const,
      installed: true,
      installSizeBytes: g.installSizeBytes,
      playtimeMinutes: 0,
      lastPlayed: null,
      coverColor: "#12161c",
      heroColor: "#0b0f14",
      coverUrl: g.logoDataUrl,
      heroUrl: null,
      genres: [],
      installPath: g.installPath,
    }));
  }

  async getGameDetails(gameId: string): Promise<GameDetails | null> {
    const game = (await this.getGames()).find((g) => g.id === gameId);
    if (!game) return null;
    const raw = this.cache?.inv.games.find((g) => g.id === gameId);
    return { ...game, achievements: { gameId, unlocked: 0, total: 0, achievements: [], status: "unsupported" }, summary: "", developer: raw?.publisher ?? "", publisher: raw?.publisher ?? "" };
  }

  async launchGame(gameId: string): Promise<boolean> {
    const raw = this.cache?.inv.games.find((g) => g.id === gameId) ?? (await this.inventory(true))?.games.find((g) => g.id === gameId);
    if (!raw?.packageFamilyName) return false;
    try {
      await invoke("xbox_launch", { packageFamilyName: raw.packageFamilyName, appId: raw.appId });
      return true;
    } catch (e) {
      log.warn("Xbox launch failed", { error: String((e as Error)?.message ?? e).slice(0, 120) });
      return false;
    }
  }
}
