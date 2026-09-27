import { describe, expect, it } from "vitest";
import { sanitizeSettings } from "./settingsSchema";
import { DEFAULT_SETTINGS } from "./settingsStore";

describe("settings sanitization", () => {
  it("returns defaults for garbage", () => {
    expect(sanitizeSettings(null, DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings("nope", DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings([1, 2], DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  it("coerces corrupted values that would otherwise crash rendering", () => {
    const s = sanitizeSettings(
      {
        appearance: { environment: "purple", backgroundIntensity: "loud", glassIntensity: 900, reducedMotion: "yes" },
        privacy: { action: "explode", hotkey: 42 },
        system: { safety: "yolo" },
        gaming: { approvedBackgroundApps: ["Spotify.exe", 7, null], defaultLauncher: "origin" },
        media: { defaultColumns: 99, defaultRows: -3 },
        window: { closeBehavior: "quit" },
      },
      DEFAULT_SETTINGS,
    );
    expect(s.appearance.environment).toBe("nexus");
    expect(s.appearance.backgroundIntensity).toBe(70);
    expect(s.appearance.glassIntensity).toBe(100);
    expect(s.appearance.reducedMotion).toBe(false);
    expect(s.privacy.action).toBe("home");
    expect(s.privacy.hotkey).toBe(DEFAULT_SETTINGS.privacy.hotkey);
    expect(s.system.safety).toBe("observe");
    expect(s.gaming.approvedBackgroundApps).toEqual(["Spotify.exe"]);
    expect(s.gaming.defaultLauncher).toBe("steam");
    expect(s.media.defaultColumns).toBe(4);
    expect(s.media.defaultRows).toBe(1);
    expect(s.window.closeBehavior).toBe("tray");
  });

  it("migrates an older config missing new fields while keeping user values", () => {
    const v2 = { profile: { name: "J", onboardingComplete: true }, appearance: { environment: "void" }, system: { safety: "enabled" } };
    const s = sanitizeSettings(v2, DEFAULT_SETTINGS);
    expect(s.profile.name).toBe("J");
    expect(s.profile.onboardingComplete).toBe(true);
    expect(s.profile.clockFormat).toBe("24h");
    expect(s.appearance.environment).toBe("void");
    expect(s.appearance.backgroundImage).toBeNull();
    expect(s.system.safety).toBe("enabled");
    expect(s.system.activityHistory).toBe(true);
    expect(s.media.thumbnails).toBe(false);
  });

  it("bounds string lengths", () => {
    const s = sanitizeSettings({ profile: { name: "x".repeat(500), subtitle: "y".repeat(500) } }, DEFAULT_SETTINGS);
    expect(s.profile.name).toHaveLength(40);
    expect(s.profile.subtitle).toHaveLength(80);
  });
});

describe("safe storage", () => {
  it("moves corrupt JSON aside instead of throwing", async () => {
    const { safeStorage } = await import("./persistence");
    localStorage.setItem("nexus-test-corrupt", "{not json");
    const storage = safeStorage()!;
    expect(await storage.getItem("nexus-test-corrupt")).toBeNull();
    expect(localStorage.getItem("nexus-test-corrupt.corrupt")).toBe("{not json");
    expect(localStorage.getItem("nexus-test-corrupt")).toBeNull();
  });
});
