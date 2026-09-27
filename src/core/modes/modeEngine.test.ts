import { describe, expect, it } from "vitest";
import { DEFAULT_MODE_CONFIGS, planModeEntry, restoreChanges } from "./modeEngine";

describe("mode engine", () => {
  it("SAFETY: observe mode performs no process actions, only notes intent", () => {
    const changes = planModeEntry(DEFAULT_MODE_CONFIGS.gaming, {
      safety: "observe",
      approvedApps: ["Spotify.exe", "Discord.exe"],
    });
    expect(changes.length).toBeGreaterThan(0);
    for (const c of changes) {
      expect(c.description).toMatch(/^\[observe\] Would /);
    }
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
