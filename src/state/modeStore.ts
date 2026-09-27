import { create } from "zustand";
import type { ModeConfig, ModeSession, OperatingMode } from "@/core/types";
import {
  DEFAULT_MODE_CONFIGS,
  planModeSteps,
  planRestoreSteps,
  restoreChanges,
  stepsToChanges,
  type ModeStep,
} from "@/core/modes/modeEngine";
import { useSettingsStore } from "./settingsStore";
import { useProcessPrefsStore } from "./processPrefsStore";
import { notify } from "./toastStore";
import { createLogger } from "@/lib/logger";

const log = createLogger("modes");

export interface ModeTransition {
  readonly target: OperatingMode;
  readonly steps: readonly ModeStep[];
  /** Index of the step currently executing; steps before it are done. */
  readonly current: number;
  readonly done: boolean;
}

interface ModeState {
  current: OperatingMode;
  session: ModeSession | null;
  configs: Record<OperatingMode, ModeConfig>;
  history: ModeSession[];
  transition: ModeTransition | null;
  /** Mode the user is previewing before confirming. */
  preview: OperatingMode | null;
  /** True while a launched game is believed to be running (reduces ambience). */
  gameRunning: boolean;
  notificationsSuppressed: boolean;
  requestMode: (mode: OperatingMode) => void;
  cancelPreview: () => void;
  enterMode: (mode: OperatingMode) => Promise<void>;
  exitToNormal: () => Promise<void>;
  updateConfig: (mode: OperatingMode, patch: Partial<ModeConfig>) => void;
  setGameRunning: (running: boolean) => void;
  /** Steps that entering `mode` would perform right now (for previews). */
  stepsFor: (mode: OperatingMode) => ModeStep[];
}

const STEP_MS = 420;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function currentOpts() {
  const settings = useSettingsStore.getState();
  return {
    safety: settings.system.safety,
    approvedApps: useProcessPrefsStore.getState().suspendAllowlist(),
  };
}

export const useModeStore = create<ModeState>((set, get) => ({
  current: "normal",
  session: null,
  configs: DEFAULT_MODE_CONFIGS,
  history: [],
  transition: null,
  preview: null,
  gameRunning: false,
  notificationsSuppressed: false,

  stepsFor: (mode) =>
    mode === "normal"
      ? planRestoreSteps(get().session?.changes ?? [])
      : planModeSteps(get().configs[mode], currentOpts()),

  requestMode: (mode) => {
    if (mode === get().current) return;
    // Gaming mode gets a preview; other modes transition directly.
    if (mode === "gaming") set({ preview: mode });
    else void get().enterMode(mode);
  },
  cancelPreview: () => set({ preview: null }),

  enterMode: async (mode) => {
    const { configs, session, history, transition } = get();
    if (transition) return;
    const opts = currentOpts();
    const reducedMotion = useSettingsStore.getState().appearance.reducedMotion;

    const steps = mode === "normal" ? planRestoreSteps(session?.changes ?? []) : planModeSteps(configs[mode], opts);
    set({ preview: null, transition: { target: mode, steps, current: 0, done: false } });

    // Walk the steps for the overlay. In observe mode nothing mutates.
    for (let i = 0; i < steps.length; i++) {
      set((s) => (s.transition ? { transition: { ...s.transition, current: i } } : {}));
      if (!reducedMotion) await sleep(STEP_MS);
    }

    // Close out any active session (restore) and commit the new state.
    let nextHistory = history;
    if (session) {
      nextHistory = [{ ...session, changes: restoreChanges(session.changes) }, ...history].slice(0, 20);
    }

    if (mode === "normal") {
      set({ current: "normal", session: null, history: nextHistory, notificationsSuppressed: false, gameRunning: false });
      log.info("Returned to normal mode");
    } else {
      const changes = stepsToChanges(steps, opts);
      set({
        current: mode,
        session: { mode, enteredAt: Date.now(), changes },
        history: nextHistory,
        notificationsSuppressed: configs[mode].suppressNotifications,
      });
      log.info("Entered mode", { mode, changeCount: changes.length, safety: opts.safety });
    }

    set((s) => (s.transition ? { transition: { ...s.transition, current: steps.length, done: true } } : {}));
    if (!reducedMotion) await sleep(650);
    set({ transition: null });

    const label = configs[mode].label;
    notify.success(
      mode === "normal" ? "Normal Mode restored" : `${label} Mode enabled`,
      mode === "normal"
        ? "Previous state restored."
        : opts.safety === "observe"
          ? "Observe-only: changes were recorded, nothing was modified."
          : `${steps.filter((s) => s.live).length} actions applied.`,
    );
  },

  exitToNormal: () => get().enterMode("normal"),
  updateConfig: (mode, patch) =>
    set((s) => ({ configs: { ...s.configs, [mode]: { ...s.configs[mode], ...patch } } })),
  setGameRunning: (gameRunning) => set({ gameRunning }),
}));
