import { beforeEach, describe, expect, it } from "vitest";
import { useProcessPrefsStore } from "./processPrefsStore";
import { fuzzyScore } from "@/lib/fuzzy";

describe("process preferences", () => {
  beforeEach(() => useProcessPrefsStore.setState({ prefs: {} }));

  it("stores preferences case-insensitively", () => {
    useProcessPrefsStore.getState().setPref("Spotify.EXE", "suspend");
    expect(useProcessPrefsStore.getState().getPref("spotify.exe")).toBe("suspend");
  });

  it("only exposes 'suspend' entries as the allowlist", () => {
    const s = useProcessPrefsStore.getState();
    s.setPref("Spotify.exe", "suspend");
    s.setPref("Discord.exe", "never");
    s.setPref("Chrome.exe", "normal");
    expect(useProcessPrefsStore.getState().suspendAllowlist()).toEqual(["spotify.exe"]);
  });

  it("setting 'normal' removes the entry", () => {
    const s = useProcessPrefsStore.getState();
    s.setPref("Spotify.exe", "suspend");
    s.setPref("Spotify.exe", "normal");
    expect(useProcessPrefsStore.getState().prefs).toEqual({});
  });
});

describe("fuzzyScore", () => {
  it("ranks exact > prefix > contains > subsequence", () => {
    expect(fuzzyScore("discord", "discord")).toBe(1);
    expect(fuzzyScore("disc", "discord")).toBeGreaterThan(fuzzyScore("cord", "discord"));
    expect(fuzzyScore("cord", "discord")).toBeGreaterThan(fuzzyScore("dcd", "discord"));
    expect(fuzzyScore("dcd", "discord")).toBeGreaterThan(0);
  });

  it("matches word initials and word starts", () => {
    expect(fuzzyScore("vsc", "visual studio code")).toBeGreaterThanOrEqual(0.78);
    expect(fuzzyScore("vs code", "visual studio code")).toBeGreaterThanOrEqual(0.78);
  });

  it("returns 0 for non-matches", () => {
    expect(fuzzyScore("xyz", "discord")).toBe(0);
  });
});
