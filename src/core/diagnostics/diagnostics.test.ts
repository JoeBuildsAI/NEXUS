import { describe, expect, it } from "vitest";
import { looksSanitized, renderDiagnostics } from "./diagnostics";

describe("diagnostics", () => {
  it("renders provider states and counts without paths or secrets", () => {
    const text = renderDiagnostics({
      appVersion: "0.1.0",
      runtime: "desktop",
      demoMode: true,
      os: { name: "Windows", version: "11 (26100)", arch: "x86_64" },
      providers: { Steam: { state: "degraded", summary: "Detected · 47 installed games", checkedAt: 0 } },
      steam: { detected: true, steamPath: "D:\\Steam", libraries: 2, installedGames: 47, apiConfigured: true, steamIdConfigured: true, malformedManifests: 0 },
      mediaRootsAuthorized: 1,
      mediaRootsReachable: 1,
      gpu: { name: "NVIDIA GeForce RTX 4080", utilizationSupported: false, temperatureSupported: false },
      autostartEnabled: true,
      privacyHotkeyRegistered: true,
      systemSafety: "observe",
      processAllowlistCount: 2,
      environment: "nexus",
    });
    expect(text).toContain("Installed games: 47");
    expect(text).toContain("authorized roots: 1");
    expect(text).toContain("Web API configured: yes");
    // Steam install path is deliberately not rendered; media paths never are.
    expect(looksSanitized(text, ["D:\\Steam", "X:\\", "apikey"])).toBe(true);
  });
});
