import { describe, expect, it, beforeEach } from "vitest";
import { usePrivacyStore } from "./privacyStore";
import { useMediaStore } from "./mediaStore";
import { useNavigationStore } from "./navigationStore";
import { useSettingsStore } from "./settingsStore";

describe("privacy mode", () => {
  beforeEach(() => {
    usePrivacyStore.setState({ active: false });
    useNavigationStore.getState().navigate("media");
    useSettingsStore
      .getState()
      .setPrivacy({ action: "home", stopPlaybackOnTrigger: true });
    // Put a couple of players into a playing state.
    useMediaStore.setState({
      slots: [
        { index: 0, itemId: "media-0", playing: true, muted: false, volume: 0.8 },
        { index: 1, itemId: "media-1", playing: true, muted: false, volume: 0.8 },
      ],
    });
  });

  it("immediately pauses all media on activation", () => {
    usePrivacyStore.getState().activate();
    expect(useMediaStore.getState().slots.every((s) => !s.playing)).toBe(true);
  });

  it("navigates away from media to Home", () => {
    usePrivacyStore.getState().activate();
    expect(useNavigationStore.getState().screen).toBe("home");
  });

  it("sets the privacy veil active", () => {
    usePrivacyStore.getState().activate();
    expect(usePrivacyStore.getState().active).toBe(true);
  });

  it("deactivate clears the veil", () => {
    usePrivacyStore.getState().activate();
    usePrivacyStore.getState().deactivate();
    expect(usePrivacyStore.getState().active).toBe(false);
  });

  it("hide-to-tray action still leaves the media screen and pauses first", () => {
    useSettingsStore.getState().setPrivacy({ action: "tray" });
    usePrivacyStore.getState().activate("hotkey");
    expect(useMediaStore.getState().slots.every((s) => !s.playing)).toBe(true);
    expect(useNavigationStore.getState().screen).toBe("home");
    expect(usePrivacyStore.getState().active).toBe(true);
  });

  it("clearWorkspaceOnTrigger unloads every slot so nothing resumes", () => {
    useSettingsStore.getState().setPrivacy({ clearWorkspaceOnTrigger: true });
    usePrivacyStore.getState().activate("hotkey");
    expect(useMediaStore.getState().slots.every((s) => s.itemId === null && !s.playing)).toBe(true);
    useSettingsStore.getState().setPrivacy({ clearWorkspaceOnTrigger: false });
  });

  it("closes the command palette and records activation time", () => {
    useNavigationStore.getState().openCommandPalette();
    usePrivacyStore.getState().activate("test");
    expect(useNavigationStore.getState().commandPaletteOpen).toBe(false);
    expect(usePrivacyStore.getState().lastActivatedAt).not.toBeNull();
  });

  it("respects the stopPlaybackOnTrigger=false setting", () => {
    useSettingsStore.getState().setPrivacy({ stopPlaybackOnTrigger: false });
    useMediaStore.setState({
      slots: [{ index: 0, itemId: "media-0", playing: true, muted: false, volume: 0.8 }],
    });
    usePrivacyStore.getState().activate();
    // Playback is left running when the user opts out of auto-pause.
    expect(useMediaStore.getState().slots[0]!.playing).toBe(true);
  });
});
