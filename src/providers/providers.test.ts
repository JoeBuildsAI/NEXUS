import { describe, expect, it } from "vitest";
import { getProviders } from "./index";
import { MockSteamProvider } from "./steam/MockSteamProvider";
import { MockSystemProvider } from "./system/MockSystemProvider";
import { MockEmailProvider } from "./email/MockEmailProvider";
import { MockMediaProvider } from "./media/MockMediaProvider";
import { LocalCommandProvider } from "./assistant/LocalCommandProvider";

describe("provider factory (switching)", () => {
  it("selects mock implementations in a non-Tauri environment", () => {
    const p = getProviders();
    // jsdom test env is not Tauri, so everything should be mock/local.
    expect(p.steam).toBeInstanceOf(MockSteamProvider);
    expect(p.system).toBeInstanceOf(MockSystemProvider);
    expect(p.email).toBeInstanceOf(MockEmailProvider);
    expect(p.media).toBeInstanceOf(MockMediaProvider);
    expect(p.assistant).toBeInstanceOf(LocalCommandProvider);
  });

  it("returns a cached, stable set of providers", () => {
    expect(getProviders()).toBe(getProviders());
  });

  it("mock steam provider returns the demo library and details", async () => {
    const { steam } = getProviders();
    const games = await steam.getGames();
    expect(games.length).toBeGreaterThan(0);
    const details = await steam.getGameDetails(games[0]!.id);
    expect(details?.achievements.total).toBeGreaterThan(0);
  });
});
