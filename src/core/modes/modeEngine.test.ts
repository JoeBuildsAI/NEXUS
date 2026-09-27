import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODE_CONFIGS,
  pickHighPerformanceScheme,
  planModeEntry,
  planModeSteps,
  planRestoreSteps,
  restoreChanges,
  stepsToChanges,
} from "./modeEngine";

describe("mode engine", () => {
  it("SAFETY: observe mode performs no system mutations, only records intent", () => {
    const steps = planModeSteps(DEFAULT_MODE_CONFIGS.gaming, { safety: "observe", approvedApps: ["Spotify.exe", "Discord.exe"] });
    const power = steps.find((s) => s.kind === "power-profile")!;
    const apps = steps.find((s) => s.kind === "process-stop")!;
    expect(power.live).toBe(false);
    expect(apps.live).toBe(false);
    const changes = stepsToChanges(steps, { safety: "observe", approvedApps: ["Spotify.exe", "Discord.exe"] });
    for (const c of changes.filter((c) => c.kind !== "notifications")) expect(c.description).toMatch(/^\[observe\] Would /);
  });

  it("closes exactly the user's approved apps (case-insensitive, deduped)", () => {
    const steps = planModeSteps(DEFAULT_MODE_CONFIGS.gaming, { safety: "enabled", approvedApps: ["Spotify.exe", "spotify.exe", "Discord.exe"] });
    const apps = steps.find((s) => s.kind === "process-stop")!;
    expect(apps.live).toBe(true);
    expect(apps.apps).toEqual(["discord.exe", "spotify.exe"]);
    expect(apps.detail).toContain("never force-killed");
    const changes = stepsToChanges(steps, { safety: "enabled", approvedApps: ["Spotify.exe", "Discord.exe"] });
    expect(changes.filter((c) => c.kind === "process-stop")).toHaveLength(2);
  });

  it("does not assume any app should close when nothing is approved", () => {
    const steps = planModeSteps(DEFAULT_MODE_CONFIGS.gaming, { safety: "enabled", approvedApps: [] });
    expect(steps.find((s) => s.kind === "process-stop")).toBeUndefined();
    expect(steps.find((s) => s.id === "apps-none")).toBeDefined();
    expect(planModeEntry(DEFAULT_MODE_CONFIGS.gaming, { safety: "enabled", approvedApps: [] }).filter((c) => c.kind === "process-stop")).toHaveLength(0);
  });

  it("power plan step is marked unsupported when the machine has no switchable plan", () => {
    const steps = planModeSteps(DEFAULT_MODE_CONFIGS.gaming, { safety: "enabled", approvedApps: [], powerSupported: false });
    const power = steps.find((s) => s.kind === "power-profile")!;
    expect(power.live).toBe(false);
    expect(power.detail).toMatch(/skipped/i);
  });

  it("gaming mode includes a NEXUS footprint-reduction step", () => {
    const steps = planModeSteps(DEFAULT_MODE_CONFIGS.gaming, { safety: "enabled", approvedApps: [] });
    expect(steps.some((s) => s.kind === "performance")).toBe(true);
  });

  it("normal mode plans no changes", () => {
    expect(planModeEntry(DEFAULT_MODE_CONFIGS.normal, { safety: "enabled", approvedApps: ["Spotify.exe"] })).toHaveLength(0);
  });

  it("restore plan covers power and notifications and never relaunches closed apps", () => {
    const changes = planModeEntry(DEFAULT_MODE_CONFIGS.gaming, { safety: "enabled", approvedApps: ["Spotify.exe"] });
    const steps = planRestoreSteps(changes);
    expect(steps.some((s) => s.id === "power" && s.kind === "restore")).toBe(true);
    expect(steps.find((s) => s.id === "apps")?.detail).toMatch(/not relaunched/);
    expect(restoreChanges(changes).every((c) => c.restored)).toBe(true);
  });

  it("picks an existing high/ultimate performance scheme, never invents one", () => {
    expect(pickHighPerformanceScheme([{ guid: "a", name: "Balanced", active: true }])).toBeNull();
    expect(pickHighPerformanceScheme([{ guid: "a", name: "Balanced", active: true }, { guid: "b", name: "High performance", active: false }])?.guid).toBe("b");
    expect(pickHighPerformanceScheme([{ guid: "b", name: "High performance", active: false }, { guid: "c", name: "Ultimate Performance", active: false }])?.guid).toBe("c");
  });

  it("real gaming PC: an active vendor performance plan is kept, not swapped", () => {
    const schemes = [
      { guid: "381b4222-f694-41f0-9685-ff5bb260df2e", name: "Balanced", active: false },
      { guid: "69472b16-83b2-4296-838b-569e8cae9cfe", name: "GameTurbo (High Performance)", active: true },
      { guid: "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c", name: "High performance", active: false },
    ];
    expect(pickHighPerformanceScheme(schemes)?.guid).toBe("69472b16-83b2-4296-838b-569e8cae9cfe");
    // From Balanced, the built-in High performance plan (by GUID) is preferred over a vendor plan listed first.
    const fromBalanced = schemes.map((s) => ({ ...s, active: s.name === "Balanced" }));
    expect(pickHighPerformanceScheme(fromBalanced)?.guid).toBe("8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c");
  });

  it("an already-active performance plan is previewed as unchanged and never recorded or restored", () => {
    const opts = { safety: "enabled" as const, approvedApps: [], powerSupported: true, activePerformancePlan: "GameTurbo (High Performance)" };
    const steps = planModeSteps(DEFAULT_MODE_CONFIGS.gaming, opts);
    const power = steps.find((s) => s.id === "power")!;
    expect(power.live).toBe(false);
    expect(power.detail).toContain("GameTurbo (High Performance)");
    expect(stepsToChanges(steps, opts).some((c) => c.kind === "power-profile")).toBe(false);
  });

  it("localized Windows: built-in plans are found by GUID", () => {
    expect(pickHighPerformanceScheme([{ guid: "381b4222-f694-41f0-9685-ff5bb260df2e", name: "Bilanciato", active: true }, { guid: "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c", name: "Prestazioni elevate", active: false }])?.guid).toBe("8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c");
  });
});
