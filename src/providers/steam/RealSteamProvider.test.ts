import { describe, expect, it } from "vitest";
import { RealSteamProvider } from "./RealSteamProvider";
import { FixtureSteamBridge } from "./SteamBridge";
import { MULTI_LIBRARY, ONE_LIBRARY, STEAM_MISSING, THIRTY_GAMES } from "@/core/steam/__fixtures__/steamFixtures";
import { isOffline } from "@/core/errors";
import type { ApiResponse } from "@/core/steam/webApi";

const ok = (body: unknown): ApiResponse => ({ status: "ok", httpStatus: 200, body: JSON.stringify(body), cached: false });

const SCHEMA = ok({
  game: {
    gameName: "Portal 2",
    availableGameStats: {
      achievements: [
        { name: "ACH_WAKE", displayName: "Wake Up Call", description: "Survive the manual override.", icon: "https://x/a.jpg", icongray: "https://x/a_gray.jpg", hidden: 0 },
        { name: "ACH_HIDDEN", displayName: "Secret", description: "", icon: "https://x/b.jpg", icongray: "https://x/b_gray.jpg", hidden: 1 },
      ],
    },
  },
});
const PLAYER = ok({ playerstats: { success: true, achievements: [{ apiname: "ACH_WAKE", achieved: 1, unlocktime: 1700000000 }, { apiname: "ACH_HIDDEN", achieved: 0, unlocktime: 0 }] } });
const PRIVATE = ok({ playerstats: { success: false, error: "Profile is not public" } });
const GLOBAL = ok({ achievementpercentages: { achievements: [{ name: "ACH_WAKE", percent: 89.4 }, { name: "ACH_HIDDEN", percent: 3.2 }] } });
const OWNED = ok({ response: { game_count: 1, games: [{ appid: 620, name: "Portal 2", playtime_forever: 1320, rtime_last_played: 1700000000 }] } });

describe("RealSteamProvider", () => {
  it("Steam missing → typed offline error, no crash", async () => {
    const p = new RealSteamProvider(new FixtureSteamBridge(STEAM_MISSING));
    await expect(p.getGames()).rejects.toSatisfy((e: unknown) => isOffline(e));
    const status = await p.getStatus();
    expect(status.detected).toBe(false);
    expect((await p.health()).state).toBe("unavailable");
  });

  it("discovery failure is contained", async () => {
    const p = new RealSteamProvider(new FixtureSteamBridge(ONE_LIBRARY, { failDiscovery: true }));
    expect((await p.discover()).detected).toBe(false);
  });

  it("maps installed games with CDN artwork and generated palette", async () => {
    const p = new RealSteamProvider(new FixtureSteamBridge(ONE_LIBRARY));
    const games = await p.getGames();
    expect(games).toHaveLength(2);
    const portal = games.find((g) => g.steamAppId === 620)!;
    expect(portal.id).toBe("steam-620");
    expect(portal.installed).toBe(true);
    expect(portal.coverUrl).toContain("/620/library_600x900.jpg");
    expect(portal.coverColor).toMatch(/^hsl\(/);
    expect(portal.installPath).toBe("C:\\Program Files (x86)\\Steam\\steamapps\\common\\Portal 2");
  });

  it("enriches playtime from owned games when API is configured", async () => {
    const p = new RealSteamProvider(new FixtureSteamBridge(ONE_LIBRARY, { apiConfigured: true, responses: { ownedGames: OWNED } }));
    const portal = (await p.getGames()).find((g) => g.steamAppId === 620)!;
    expect(portal.playtimeMinutes).toBe(1320);
    expect(portal.lastPlayed).toBe(1700000000 * 1000);
  });

  it("only launches discovered games, by numeric app id", async () => {
    const bridge = new FixtureSteamBridge(ONE_LIBRARY);
    const p = new RealSteamProvider(bridge);
    expect(await p.launchGame("steam-620")).toBe(true);
    expect(await p.launchGame("steam-424242")).toBe(false);
    expect(await p.launchGame("C:\\evil.exe")).toBe(false);
    expect(bridge.launched).toEqual([620]);
  });

  it("achievements: not configured → schema with not-configured status", async () => {
    const p = new RealSteamProvider(new FixtureSteamBridge(ONE_LIBRARY));
    const a = await p.getAchievements("steam-620");
    expect(a?.status).toBe("not-configured");
    expect(a?.achievements).toHaveLength(0);
  });

  it("achievements: full merge with rarity and unlock times", async () => {
    const p = new RealSteamProvider(new FixtureSteamBridge(ONE_LIBRARY, { apiConfigured: true, responses: { schema: SCHEMA, playerAchievements: PLAYER, globalPercentages: GLOBAL } }));
    const a = await p.getAchievements("steam-620");
    expect(a?.status).toBe("ok");
    expect(a?.total).toBe(2);
    expect(a?.unlocked).toBe(1);
    const wake = a!.achievements.find((x) => x.name === "Wake Up Call")!;
    expect(wake.unlocked).toBe(true);
    expect(wake.unlockedAt).toBe(1700000000 * 1000);
    expect(wake.globalPercent).toBe(89.4);
    expect(wake.iconUrl).toBe("https://x/a.jpg");
    const hidden = a!.achievements.find((x) => x.hidden)!;
    expect(hidden.iconUrl).toBe("https://x/b_gray.jpg");
  });

  it("achievements: private profile", async () => {
    const p = new RealSteamProvider(new FixtureSteamBridge(ONE_LIBRARY, { apiConfigured: true, responses: { schema: SCHEMA, playerAchievements: PRIVATE } }));
    expect((await p.getAchievements("steam-620"))?.status).toBe("private-profile");
  });

  it("achievements: game without achievements", async () => {
    const p = new RealSteamProvider(new FixtureSteamBridge(ONE_LIBRARY, { apiConfigured: true, responses: { schema: ok({ game: { gameName: "X", availableGameStats: {} } }) } }));
    expect((await p.getAchievements("steam-620"))?.status).toBe("no-achievements");
  });

  it("achievements: network unavailable", async () => {
    const p = new RealSteamProvider(new FixtureSteamBridge(ONE_LIBRARY, { apiConfigured: true, responses: { schema: { status: "network-error", httpStatus: 0, body: "", cached: false } } }));
    expect((await p.getAchievements("steam-620"))?.status).toBe("network-error");
  });

  it("multi-library: status counts fully installed only and reports malformed", async () => {
    const p = new RealSteamProvider(new FixtureSteamBridge(MULTI_LIBRARY));
    const s = await p.getStatus();
    expect(s.libraries).toBe(3);
    expect(s.installedGames).toBe(3); // 620, 1091500, 1086940 (553850 uninstalling)
    expect(s.malformedManifests).toBe(2);
    expect((await p.health()).state).toBe("degraded");
  });

  it("session probe uses install path", async () => {
    const running = new Set(["C:\\Program Files (x86)\\Steam\\steamapps\\common\\Portal 2"]);
    const p = new RealSteamProvider(new FixtureSteamBridge(ONE_LIBRARY, { running }));
    expect(await p.isGameRunning("steam-620")).toBe(true);
    expect(await p.isGameRunning("steam-864050")).toBe(false);
  });

  it("renders 30 games", async () => {
    const p = new RealSteamProvider(new FixtureSteamBridge(THIRTY_GAMES));
    expect(await p.getGames()).toHaveLength(30);
  });
});
