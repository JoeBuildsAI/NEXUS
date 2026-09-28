import { create } from "zustand";
import type { ModeConfig, ModeSession, OperatingMode } from "@/core/types";
import {
  DEFAULT_MODE_CONFIGS,
  pickHighPerformanceScheme,
  planModeSteps,
  planRestoreSteps,
  restoreChanges,
  stepsToChanges,
  type ModeStep,
} from "@/core/modes/modeEngine";
import { useSettingsStore } from "./settingsStore";
import { useProcessPrefsStore } from "./processPrefsStore";
import { notify } from "./toastStore";
import { native } from "@/providers/system/nativeBridge";
import { classifyProcess, isManageable } from "@/core/safety/processClassifier";
import { createLogger } from "@/lib/logger";
import { activity } from "./activityStore";

const log = createLogger("modes");

export type StepResult = "done" | "observed" | "unsupported" | "failed" | "skipped";

export interface ModeTransition {
  readonly target: OperatingMode;
  readonly steps: readonly ModeStep[];
  /** Index of the step currently executing; steps before it are done. */
  readonly current: number;
  readonly done: boolean;
  readonly results: Readonly<Record<string, StepResult>>;
}

interface ModeState {
  current: OperatingMode;
  session: ModeSession | null;
  configs: Record<OperatingMode, ModeConfig>;
  history: ModeSession[];
  transition: ModeTransition | null;
  preview: OperatingMode | null;
  /** True while a launched game is believed to be running (reduces footprint). */
  gameRunning: boolean;
  notificationsSuppressed: boolean;
  /** Power plan GUID that was active before NEXUS changed it (null = unchanged). */
  previousPowerGuid: string | null;
  powerSupported: boolean | null;
  /** Name of the active plan when it already is a performance plan (Gaming Mode leaves it alone). */
  activePerformancePlan: string | null;
  requestMode: (mode: OperatingMode) => void;
  cancelPreview: () => void;
  enterMode: (mode: OperatingMode) => Promise<void>;
  exitToNormal: () => Promise<void>;
  updateConfig: (mode: OperatingMode, patch: Partial<ModeConfig>) => void;
  setGameRunning: (running: boolean) => void;
  stepsFor: (mode: OperatingMode) => ModeStep[];
  /** Probe power support once (cached). */
  probePower: () => Promise<boolean>;
  /** Detect a stale session from a previous crash and restore it. */
  recoverStaleSession: () => Promise<boolean>;
}

const STEP_MS = 420;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function currentOpts(powerSupported: boolean | null, activePerformancePlan: string | null = null) {
  const settings = useSettingsStore.getState();
  return {
    safety: settings.system.safety,
    approvedApps: useProcessPrefsStore.getState().closeAllowlist(),
    powerSupported: powerSupported ?? true,
    activePerformancePlan,
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
  previousPowerGuid: null,
  powerSupported: null,
  activePerformancePlan: null,

  probePower: async () => {
    // Not cached: the user can switch plans outside NEXUS at any time.
    const st = await native.powerState();
    const hp = st.supported ? pickHighPerformanceScheme(st.schemes) : null;
    const active = hp && st.activeGuid && hp.guid.toLowerCase() === st.activeGuid.toLowerCase() ? hp.name : null;
    set({ powerSupported: hp != null, activePerformancePlan: active });
    return hp != null;
  },

  stepsFor: (mode) =>
    mode === "normal"
      ? planRestoreSteps(get().session?.changes ?? [])
      : planModeSteps(get().configs[mode], currentOpts(get().powerSupported, get().activePerformancePlan)),

  requestMode: (mode) => {
    if (mode === get().current) return;
    void get().probePower();
    if (mode === "gaming") set({ preview: mode });
    else void get().enterMode(mode);
  },
  cancelPreview: () => set({ preview: null }),

  enterMode: async (mode) => {
    const { configs, session, history, transition } = get();
    if (transition) return;
    const powerSupported = await get().probePower();
    const opts = currentOpts(powerSupported, get().activePerformancePlan);
    const reducedMotion = useSettingsStore.getState().appearance.reducedMotion;
    const steps = mode === "normal" ? planRestoreSteps(session?.changes ?? []) : planModeSteps(configs[mode], opts);
    set({ preview: null, transition: { target: mode, steps, current: 0, done: false, results: {} } });

    const mark = (id: string, r: StepResult) =>
      set((s) => (s.transition ? { transition: { ...s.transition, results: { ...s.transition.results, [id]: r } } } : {}));

    let previousPowerGuid = get().previousPowerGuid;
    const closedApps: string[] = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;
      set((s) => (s.transition ? { transition: { ...s.transition, current: i } } : {}));
      const started = Date.now();
      try {
        if (!step.live) mark(step.id, step.kind === "note" ? "skipped" : "observed");
        else if (step.kind === "power-profile") {
          const st = await native.powerState();
          const hp = pickHighPerformanceScheme(st.schemes);
          if (!st.supported || !hp) mark(step.id, "unsupported");
          else if (st.activeGuid && st.activeGuid.toLowerCase() === hp.guid.toLowerCase()) mark(step.id, "skipped");
          else {
            previousPowerGuid = st.activeGuid;
            const ok = await native.powerSetActive(hp.guid);
            mark(step.id, ok ? "done" : "failed");
            if (!ok) previousPowerGuid = null;
            // Persist immediately so a crash can be recovered.
            await native.sessionWrite({ mode, startedAt: Date.now(), previousPowerGuid, closedApps, startupChanges: [] });
          }
        } else if (step.kind === "process-stop") {
          let any = false;
          const running = await native.processList();
          for (const app of step.apps ?? []) {
            // Execution-time veto: a typed or stale allowlist entry never closes a
            // process whose running instance classifies as protected by its path.
            const vetoed = running?.some((p) => p.name.toLowerCase() === app.toLowerCase() && !isManageable(classifyProcess(p.name, null, p.path)));
            if (vetoed) { log.warn("Allowlisted app skipped: running instance is protected", { app }); continue; }
            const r = await native.closeGraceful(app);
            if (r.ok && r.count > 0) {
              closedApps.push(app);
              any = true;
            }
          }
          mark(step.id, any ? "done" : "skipped");
        } else if (step.kind === "restore" && step.id === "power") {
          const prev = get().previousPowerGuid;
          if (prev) {
            const ok = await native.powerSetActive(prev);
            mark(step.id, ok ? "done" : "failed");
            if (ok) previousPowerGuid = null;
          } else mark(step.id, "skipped");
        } else if (step.kind === "performance") {
          mark(step.id, "done");
        } else mark(step.id, "done");
      } catch (err) {
        log.warn("Mode step failed", { step: step.id, error: String(err) });
        mark(step.id, "failed");
      }
      if (!reducedMotion) await sleep(Math.max(0, STEP_MS - (Date.now() - started)));
    }

    let nextHistory = history;
    if (session) nextHistory = [{ ...session, changes: restoreChanges(session.changes) }, ...history].slice(0, 20);

    if (mode === "normal") {
      await native.sessionClear();
      set({ current: "normal", session: null, history: nextHistory, notificationsSuppressed: false, gameRunning: false, previousPowerGuid });
      log.info("Returned to normal mode");
      activity.record("mode-exited", "Returned to Normal Mode");
    } else {
      const changes = stepsToChanges(steps, opts);
      set({ current: mode, session: { mode, enteredAt: Date.now(), changes }, history: nextHistory, notificationsSuppressed: configs[mode].suppressNotifications, previousPowerGuid });
      if (previousPowerGuid || closedApps.length) await native.sessionWrite({ mode, startedAt: Date.now(), previousPowerGuid, closedApps, startupChanges: [] });
      log.info("Entered mode", { mode, changeCount: changes.length, safety: opts.safety, closed: closedApps.length });
      activity.record("mode-entered", `${configs[mode].label} Mode${closedApps.length ? ` · closed ${closedApps.length} app${closedApps.length === 1 ? "" : "s"}` : ""}${opts.safety === "observe" ? " · observe only" : ""}`);
    }

    set((s) => (s.transition ? { transition: { ...s.transition, current: steps.length, done: true } } : {}));
    if (!reducedMotion) await sleep(650);
    set({ transition: null });

    const label = configs[mode].label;
    const live = steps.filter((s) => s.live && s.kind !== "environment" && s.kind !== "note").length;
    notify.success(
      mode === "normal" ? "Normal Mode restored" : `${label} Mode enabled`,
      mode === "normal"
        ? "Previous state restored."
        : opts.safety === "observe"
          ? "Observe-only: changes were recorded, nothing was modified."
          : `${live} action${live === 1 ? "" : "s"} applied${closedApps.length ? ` · closed ${closedApps.join(", ")}` : ""}.`,
    );
  },

  exitToNormal: () => get().enterMode("normal"),
  updateConfig: (mode, patch) => set((s) => ({ configs: { ...s.configs, [mode]: { ...s.configs[mode], ...patch } } })),
  setGameRunning: (gameRunning) => set({ gameRunning }),

  recoverStaleSession: () => {
    // Concurrent boot paths (StrictMode, re-mounts) share one recovery.
    recovery ??= recoverOnce().finally(() => { recovery = null; });
    return recovery;
  },
}));

let recovery: Promise<boolean> | null = null;

async function recoverOnce(): Promise<boolean> {
  const rec = await native.sessionRead();
  if (!rec) return false;
  let restored = false;
  if (rec.previousPowerGuid) {
    restored = await native.powerSetActive(rec.previousPowerGuid);
  }
  await native.sessionClear();
  log.info("Recovered stale mode session", { mode: rec.mode, restoredPower: restored });
  activity.record("session-recovered", restored ? "Restored the previous power plan after an interrupted session" : "Cleared an interrupted mode session");
  notify.warn(
    "Previous session recovered",
    restored ? "NEXUS closed unexpectedly during Gaming Mode. The previous power plan has been restored." : "NEXUS closed unexpectedly during a mode. Session state was cleared.",
  );
  return true;
}
