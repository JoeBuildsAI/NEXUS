import { create } from "zustand";
import type { ModeConfig, ModeSession, OperatingMode } from "@/core/types";
import {
  DEFAULT_MODE_CONFIGS,
  planModeEntry,
  restoreChanges,
} from "@/core/modes/modeEngine";
import { useSettingsStore } from "./settingsStore";
import { createLogger } from "@/lib/logger";

const log = createLogger("modes");

interface ModeState {
  current: OperatingMode;
  session: ModeSession | null;
  configs: Record<OperatingMode, ModeConfig>;
  /** History of past sessions for the "what NEXUS changed" audit view. */
  history: ModeSession[];
  enterMode: (mode: OperatingMode) => void;
  exitToNormal: () => void;
  updateConfig: (mode: OperatingMode, patch: Partial<ModeConfig>) => void;
}

export const useModeStore = create<ModeState>((set, get) => ({
  current: "normal",
  session: null,
  configs: DEFAULT_MODE_CONFIGS,
  history: [],
  enterMode: (mode) => {
    const { configs, session, history } = get();
    // Restore any active session first.
    let nextHistory = history;
    if (session) {
      nextHistory = [
        { ...session, changes: restoreChanges(session.changes) },
        ...history,
      ].slice(0, 20);
    }

    if (mode === "normal") {
      set({ current: "normal", session: null, history: nextHistory });
      log.info("Entered normal mode");
      return;
    }

    const settings = useSettingsStore.getState();
    const changes = planModeEntry(configs[mode], {
      safety: settings.system.safety,
      approvedApps: settings.gaming.approvedBackgroundApps,
    });
    const newSession: ModeSession = {
      mode,
      enteredAt: Date.now(),
      changes,
    };
    set({ current: mode, session: newSession, history: nextHistory });
    log.info("Entered mode", { mode, changeCount: changes.length });
  },
  exitToNormal: () => get().enterMode("normal"),
  updateConfig: (mode, patch) =>
    set((s) => ({
      configs: { ...s.configs, [mode]: { ...s.configs[mode], ...patch } },
    })),
}));
