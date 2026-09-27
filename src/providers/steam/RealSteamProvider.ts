import type { Game, GameAchievements, GameDetails, ProviderHealth, SteamStatus } from "@/core/types";
import { ProviderOfflineError } from "@/core/errors";
import { buildDiscovery, type InstalledGame, type SteamDiscovery } from "@/core/steam/discovery";
import { generatedPalette, mergeArtwork, steamCdnArtwork } from "@/core/steam/artwork";
import {
  mergeAchievements,
  parseGlobalPercentages,
  parseOwnedGames,
  parsePlayerAchievements,
  parseSchema,
  transportStatus,
  type OwnedGame,
} from "@/core/steam/webApi";
import { createLogger } from "@/lib/logger";
import type { SteamBridge } from "./SteamBridge";
import type { SteamProvider } from "./SteamProvider";

const log = createLogger("steam");
const DISCOVERY_TTL = 60_000;
const ACH_TTL = 10 * 60_000;

export const gameIdFor = (appId: number) => `steam-${appId}`;
export const appIdFrom = (gameId: string): number | null => {
  const m = /^steam-(\d+)$/.exec(gameId);
  return m ? Number(m[1]) : null;
};

/**
 * Production Steam provider. Discovery is local and read-only (registry +
 * manifests); playtime and achievements come from the Steam Web API only when
 * the user configured credentials (stored in the OS credential store).
 */
export class RealSteamProvider implements SteamProvider {
  readonly id = "real-steam";
  private discovery: { at: number; value: SteamDiscovery } | null = null;
  private owned: { at: number; value: Map<number, OwnedGame> | null } | null = null;
  private achCache = new Map<number, { at: number; value: GameAchievements }>();
  private artworkCache = new Map<number, { cover: string | null; hero: string | null }>();

  constructor(private bridge: SteamBridge) {}

  // ---------- discovery ----------
  private inflight: Promise<SteamDiscovery> | null = null;

  /** Concurrent callers (library, status, palette) share one native scan. */
  async discover(force = false): Promise<SteamDiscovery> {
    if (!force && this.discovery && Date.now() - this.discovery.at < DISCOVERY_TTL) return this.discovery.value;
    if (this.inflight) return this.inflight;
    this.inflight = this.scan().finally(() => { this.inflight = null; });
    return this.inflight;
  }

  private async scan(): Promise<SteamDiscovery> {
    try {
      const raw = await this.bridge.discover();
      const value = buildDiscovery(raw);
      this.discovery = { at: Date.now(), value };
      log.info("Steam discovery", { detected: value.detected, libraries: value.libraries.length, games: value.games.length, malformed: value.malformed.length });
      return value;
    } catch (err) {
      log.warn("Steam discovery failed", { error: String(err) });
      const value: SteamDiscovery = { detected: false, steamPath: null, libraries: [], games: [], malformed: [], artworkCacheDir: null };
      this.discovery = { at: Date.now(), value };
      return value;
    }
  }

  private async ownedGames(): Promise<Map<number, OwnedGame> | null> {
    if (this.owned && Date.now() - this.owned.at < ACH_TTL) return this.owned.value;
    const r = await this.bridge.apiGet("ownedGames", { include_appinfo: "1", include_played_free_games: "1", format: "json" });
    const value = r.status === "ok" ? parseOwnedGames(r.body) : null;
    this.owned = { at: Date.now(), value };
    return value;
  }

  private async artwork(appId: number) {
    const hit = this.artworkCache.get(appId);
    if (hit) return hit;
    let local: { cover?: string; hero?: string } = {};
    try {
      const pairs = await this.bridge.localArtwork(appId);
      for (const [kind, path] of pairs) {
        if (kind === "cover") local.cover = this.bridge.toAssetUrl(path);
        if (kind === "hero") local.hero = this.bridge.toAssetUrl(path);
      }
    } catch {
      local = {};
    }
    const set = mergeArtwork(local, steamCdnArtwork(appId));
    const out = { cover: set.cover, hero: set.hero };
    this.artworkCache.set(appId, out);
    return out;
  }

  private async toGame(g: InstalledGame, owned: Map<number, OwnedGame> | null): Promise<Game> {
    const palette = generatedPalette(g.name);
    const art = await this.artwork(g.appId);
    const o = owned?.get(g.appId);
    return {
      id: gameIdFor(g.appId),
      title: g.name,
      steamAppId: g.appId,
      launcher: "steam",
      installed: g.fullyInstalled,
      installState: g.installState,
      installSizeBytes: g.sizeOnDisk,
      playtimeMinutes: o?.playtimeMinutes ?? 0,
      // Never substitute LastUpdated: an auto-update is not a play session.
      lastPlayed: o?.lastPlayed ?? g.lastPlayed,
      coverColor: palette.cover,
      heroColor: palette.hero,
      coverUrl: art.cover,
      heroUrl: art.hero,
      genres: [],
      installPath: g.installPath,
    };
  }

  // ---------- SteamProvider ----------
  async getGames(): Promise<readonly Game[]> {
    const d = await this.discover();
    if (!d.detected) throw new ProviderOfflineError("Steam", "Steam is not installed on this machine.");
    const owned = await this.ownedGames().catch(() => null);
    return Promise.all(d.games.map((g) => this.toGame(g, owned)));
  }

  async getGameDetails(gameId: string): Promise<GameDetails | null> {
    const appId = appIdFrom(gameId);
    if (!appId) return null;
    const d = await this.discover();
    if (!d.detected) throw new ProviderOfflineError("Steam", "Steam is not installed on this machine.");
    const g = d.games.find((x) => x.appId === appId);
    if (!g) return null;
    const owned = await this.ownedGames().catch(() => null);
    const game = await this.toGame(g, owned);
    const achievements = (await this.getAchievements(gameId)) ?? { gameId, unlocked: 0, total: 0, achievements: [], status: "not-configured" as const };
    return { ...game, achievements, summary: "", developer: "", publisher: "" };
  }

  async getAchievements(gameId: string): Promise<GameAchievements | null> {
    const appId = appIdFrom(gameId);
    if (!appId) return null;
    const hit = this.achCache.get(appId);
    if (hit && Date.now() - hit.at < ACH_TTL) return hit.value;

    const empty = (status: GameAchievements["status"]): GameAchievements => ({ gameId, unlocked: 0, total: 0, achievements: [], status });
    let result: GameAchievements;
    try {
      const schemaResp = await this.bridge.apiGet("schema", { appid: String(appId), l: "english" });
      const t = transportStatus(schemaResp);
      if (t) result = empty(t);
      else {
        const schema = parseSchema(schemaResp.body);
        if (schema === null) result = empty("api-error");
        else if (schema.length === 0) result = empty("no-achievements");
        else {
          const playerResp = await this.bridge.apiGet("playerAchievements", { appid: String(appId), l: "english" });
          const pt = transportStatus(playerResp);
          if (pt) result = pt === "not-configured" ? { ...mergeAchievements(gameId, schema, [], new Map()), status: "not-configured" } : empty(pt);
          else {
            const player = parsePlayerAchievements(playerResp.body);
            if (player.status !== "ok" && player.status !== "no-achievements") result = empty(player.status);
            else {
              const globalResp = await this.bridge.apiGet("globalPercentages", { gameid: String(appId) });
              const global = globalResp.status === "ok" ? parseGlobalPercentages(globalResp.body) : new Map<string, number>();
              result = { ...mergeAchievements(gameId, schema, player.achievements, global), status: "ok" };
            }
          }
        }
      }
    } catch (err) {
      log.warn("Achievement fetch failed", { appId, error: String(err) });
      result = empty("network-error");
    }
    // Cache successes and definitive states; retry transient failures sooner.
    const ttl = result.status === "network-error" || result.status === "api-error" ? 30_000 : ACH_TTL;
    this.achCache.set(appId, { at: Date.now() - (ACH_TTL - ttl), value: result });
    return result;
  }

  async launchGame(gameId: string): Promise<boolean> {
    const appId = appIdFrom(gameId);
    if (!appId) return false;
    const d = await this.discover();
    const g = d.games.find((x) => x.appId === appId);
    if (!g) return false; // only discovered games can be launched
    try {
      await this.bridge.launch(appId);
      log.info("Launch requested", { appId });
      return true;
    } catch (err) {
      log.error("Launch failed", { appId, error: String(err) });
      return false;
    }
  }

  /** Whether a process from the game's install folder is running (safe probe). */
  async isGameRunning(gameId: string): Promise<boolean> {
    const appId = appIdFrom(gameId);
    if (!appId) return false;
    const d = await this.discover();
    const g = d.games.find((x) => x.appId === appId);
    if (!g) return false;
    return this.bridge.isRunningUnder(g.installPath).catch(() => false);
  }

  async getStatus(): Promise<SteamStatus> {
    const d = await this.discover();
    const secrets = await this.bridge.secretStatus(["steam.apiKey", "steam.steamId"]).catch(() => []);
    const has = (k: string) => secrets.find((s) => s.key === k)?.configured ?? false;
    return {
      detected: d.detected,
      steamPath: d.steamPath,
      libraries: d.libraries.length,
      installedGames: d.games.filter((g) => g.fullyInstalled).length,
      apiConfigured: has("steam.apiKey"),
      steamIdConfigured: has("steam.steamId"),
      malformedManifests: d.malformed.length,
    };
  }

  async health(): Promise<ProviderHealth> {
    const s = await this.getStatus();
    const checkedAt = Date.now();
    if (!s.detected) return { state: "unavailable", summary: "Steam not detected", detail: "Install Steam or sign in once so NEXUS can find it.", checkedAt };
    if (!s.apiConfigured || !s.steamIdConfigured) return { state: "degraded", summary: `Detected · ${s.installedGames} installed games`, detail: "Web API not configured — playtime and achievements unavailable.", checkedAt };
    return { state: "available", summary: `Connected · ${s.installedGames} installed games`, checkedAt };
  }

  async mode(): Promise<"real" | "demo"> {
    return "real";
  }

  /** Drop caches (after credentials change). */
  invalidate(): void {
    this.owned = null;
    this.achCache.clear();
    this.discovery = null;
  }
}
