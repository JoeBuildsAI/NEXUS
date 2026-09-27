import { describe, expect, it } from "vitest";
import { BACKUP_VERSION, containsSensitive, createBackup, validateBackup } from "./configBackup";

const input = {
  appVersion: "0.1.0",
  settings: {
    profile: { name: "Joseph", onboardingComplete: true },
    appearance: { environment: "nexus", reducedMotion: false },
    startup: { launchOnLogin: true },
    gaming: { gamingModeEnabled: true, steamApiKey: "SHOULD-NOT-EXPORT" },
    media: { defaultColumns: 3, defaultRows: 2, pauseOnHide: true, authorizedFolders: ["X:\\Videos"] },
    privacy: { action: "home" },
    system: { safety: "observe" },
    ai: { provider: "local", token: "nope" },
    shortcuts: { screenPrefix: "ctrl" },
  },
  processPrefs: { "spotify.exe": "close" as const, "discord.exe": "never" as const },
  trackedAchievements: [{ gameId: "wwht", gameTitle: "We Were Here Too", achievementId: "wwht_18", name: "Kings & Pawns", trackedAt: 1 }],
  mediaRoots: ["X:\\Videos"],
};

describe("config backup", () => {
  it("exports non-sensitive settings only", () => {
    const b = createBackup(input);
    const json = JSON.stringify(b);
    expect(b.version).toBe(BACKUP_VERSION);
    expect(json).not.toContain("SHOULD-NOT-EXPORT");
    expect(json).not.toContain("authorizedFolders");
    expect(json).not.toContain("X:\\\\Videos");
    expect(containsSensitive(json)).toBe(false);
    expect(b.processPrefs["spotify.exe"]).toBe("close");
    expect(b.trackedAchievements).toHaveLength(1);
    expect(b.mediaRoots).toBeUndefined();
  });

  it("includes media roots only when explicitly requested", () => {
    const b = createBackup({ ...input, includeMediaRoots: true });
    expect(b.mediaRoots).toEqual(["X:\\Videos"]);
  });

  it("round-trips through validation", () => {
    const b = createBackup(input);
    const v = validateBackup(JSON.parse(JSON.stringify(b)));
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.backup.settings.profile.name).toBe("Joseph");
      expect(v.backup.processPrefs["discord.exe"]).toBe("never");
      expect(v.warnings).toEqual([]);
    }
  });

  it("rejects foreign / newer / malformed payloads", () => {
    expect(validateBackup(null).ok).toBe(false);
    expect(validateBackup({ format: "other" }).ok).toBe(false);
    expect(validateBackup({ format: "nexus-config", version: 99, settings: {} }).ok).toBe(false);
    expect(validateBackup({ format: "nexus-config", version: 1 }).ok).toBe(false);
  });

  it("sanitizes imported content and migrates legacy prefs", () => {
    const v = validateBackup({
      format: "nexus-config",
      version: 1,
      settings: { profile: { name: "X".repeat(100) }, gaming: { apiKey: "leak", gamingModeEnabled: true } },
      processPrefs: { "Spotify.exe": "suspend", "evil.exe": "kill" },
      trackedAchievements: [{ bad: true }],
      mediaRoots: ["X:\\"],
    });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.backup.settings.profile.name).toHaveLength(40);
      expect(v.backup.settings.gaming).not.toHaveProperty("apiKey");
      expect(v.backup.processPrefs).toEqual({ "spotify.exe": "close" });
      expect(v.backup.trackedAchievements).toEqual([]);
      expect(v.warnings.length).toBeGreaterThan(0);
    }
  });
});
