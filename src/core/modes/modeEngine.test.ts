import { describe, expect, it } from "vitest";
import { DEFAULT_MODE_CONFIGS, planModeEntry, restoreChanges } from "./modeEngine";

describe("mode engine", () => {
  it("SAFETY: observe mode performs no process actions, only notes intent", () => {
    const changes = planModeEntry(DEFAULT_MODE_CONFIGS.gaming, {
      safety: "observe",
      approvedApps: ["Spotify.exe", "Discord.exe"],
    });
    expect(changes.length).toBeGreaterThan(0);
    // System-mutating kinds must be observe-prefixed; in-app notification
    // suppression is not a system mutation and may apply.
    const mutating = changes.filter((c) => c.kind !== "notifications");
    expect(mutating.length).toBeGreaterThan(0);
    for (const c of mutating) {
      expect(c.description).toMatch(/^\[observe\] Would /);
    }
  });

  it("planModeSteps marks system-mutating steps as not live in observe mode", async () => {
    const { planModeSteps } = await import("./modeEngine");
    const steps = planModeSteps(DEFAULT_MODE_CONFIGS.gaming, { safety: "observe", approvedApps: ["Spotify.exe"] });
    const power = steps.find((s) => s.kind === "power-profile");
    const apps = steps.find((s) => s.kind === "process-suspend");
    expect(power?.live).toBe(false);
    expect(apps?.live).toBe(false);
  });

  it("allowlist matching is case-insensitive", async () => {
    const { planModeSteps } = await import("./modeEngine");
    const steps = planModeSteps(DEFAULT_MODE_CONFIGS.gaming, { safety: "enabled", approvedApps: ["spotify.exe"] });
    expect(steps.find((s) => s.kind === "process-suspend")?.detail).toContain("Spotify.exe");
  });

  it("only suspends apps in the intersection of allowlist and approved apps", () => {
    const changes = planModeEntry(DEFAULT_MODE_CONFIGS.gaming, {
      safety: "enabled",
      approvedApps: ["Spotify.exe"], // Discord not approved
    });
    const suspends = changes.filter((c) => c.kind === "process-suspend");
    expect(suspends).toHaveLength(1);
    expect(suspends[0]!.description).toContain("Spotify.exe");
  });

  it("suspends nothing when the user has approved no apps", () => {
    const changes = planModeEntry(DEFAULT_MODE_CONFIGS.gaming, {
      safety: "enabled",
      approvedApps: [],
    });
    expect(changes.filter((c) => c.kind === "process-suspend")).toHaveLength(0);
  });

  it("normal mode makes no changes", () => {
    const changes = planModeEntry(DEFAULT_MODE_CONFIGS.normal, {
      safety: "enabled",
      approvedApps: ["Spotify.exe"],
    });
    expect(changes).toHaveLength(0);
  });

  it("restoreChanges marks all changes as restored", () => {
    const changes = planModeEntry(DEFAULT_MODE_CONFIGS.gaming, {
      safety: "enabled",
      approvedApps: ["Spotify.exe"],
    });
    const restored = restoreChanges(changes);
    expect(restored.every((c) => c.restored)).toBe(true);
  });
});
