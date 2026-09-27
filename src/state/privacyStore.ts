import { create } from "zustand";
import { useMediaStore } from "./mediaStore";
import { useNavigationStore } from "./navigationStore";
import { useSettingsStore } from "./settingsStore";
import { createLogger } from "@/lib/logger";

const log = createLogger("privacy");

interface PrivacyState {
  /** When true, a full-screen privacy veil is shown and media is hidden. */
  active: boolean;
  activate: () => void;
  deactivate: () => void;
}

/**
 * Privacy mode. Triggering is IMMEDIATE and does not rely on animation:
 *  - media playback is paused/stopped synchronously
 *  - the media workspace is hidden behind a veil / navigation moves to Home
 *  - the app may minimize depending on settings
 *
 * No media filenames are logged.
 */
export const usePrivacyStore = create<PrivacyState>((set) => ({
  active: false,
  activate: () => {
    const settings = useSettingsStore.getState().privacy;

    // 1. Stop/pause playback synchronously.
    if (settings.stopPlaybackOnTrigger) {
      useMediaStore.getState().pauseAll();
    }

    // 2. Move away from media surfaces immediately.
    const nav = useNavigationStore.getState();
    if (settings.action === "home") {
      nav.navigate("home");
      nav.closeCommandPalette();
    }
    set({ active: true });
    log.info("Privacy mode activated", { action: settings.action });

    // 3. Optionally minimize the window (best-effort, non-blocking).
    if (settings.action === "minimize") {
      void minimizeWindow();
    }
  },
  deactivate: () => {
    set({ active: false });
    log.info("Privacy mode deactivated");
  },
}));

async function minimizeWindow(): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().minimize();
  } catch {
    // Not in Tauri (browser dev) — the veil is sufficient.
  }
}
