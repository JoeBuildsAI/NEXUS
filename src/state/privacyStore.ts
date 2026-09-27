import { create } from "zustand";
import { useMediaStore } from "./mediaStore";
import { useNavigationStore } from "./navigationStore";
import { useSettingsStore } from "./settingsStore";
import { createLogger } from "@/lib/logger";

const log = createLogger("privacy");

interface PrivacyState {
  /** When true, a full-screen privacy veil is shown and media is hidden. */
  active: boolean;
  lastActivatedAt: number | null;
  activate: (source?: "hotkey" | "ui" | "test" | "tray") => void;
  deactivate: () => void;
}

/**
 * Privacy mode. Activation is SYNCHRONOUS and does not rely on animation:
 *  1. media playback is paused (and optionally the workspace is cleared)
 *  2. navigation leaves media surfaces; the veil flag flips on
 *  3. depending on setting, the window is minimized or hidden to tray
 *
 * No media filenames are logged.
 */
export const usePrivacyStore = create<PrivacyState>((set) => ({
  active: false,
  lastActivatedAt: null,
  activate: (source = "ui") => {
    const settings = useSettingsStore.getState().privacy;
    const media = useMediaStore.getState();

    if (settings.stopPlaybackOnTrigger) {
      media.pauseAll();
      media.muteAll(true); // suppress audio even if a pause is slow to take effect
    }
    if (settings.clearWorkspaceOnTrigger) media.clearAll();

    const nav = useNavigationStore.getState();
    nav.closeCommandPalette();
    if (nav.screen === "media" || settings.action === "home") nav.navigate("home");

    set({ active: true, lastActivatedAt: Date.now() });
    log.info("Privacy mode activated", { action: settings.action, source });

    if (settings.action === "minimize") void windowOp("minimize");
    else if (settings.action === "tray") void windowOp("hide");
  },
  deactivate: () => {
    set({ active: false });
    log.info("Privacy mode deactivated");
  },
}));

async function windowOp(op: "minimize" | "hide"): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const w = getCurrentWindow();
    if (op === "minimize") await w.minimize();
    else await w.hide();
  } catch {
    // Not in Tauri (browser dev) — the veil is sufficient.
  }
}
