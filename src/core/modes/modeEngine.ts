import type { ModeChange, ModeConfig, OperatingMode } from "@/core/types";

export const DEFAULT_MODE_CONFIGS: Record<OperatingMode, ModeConfig> = {
  normal: {
    mode: "normal",
    label: "Normal",
    description: "Balanced everyday environment. NEXUS makes no system changes.",
    manageBackgroundApps: false,
    backgroundAppAllowlist: [],
    powerProfile: "balanced",
    suppressNotifications: false,
    launchTargetId: null,
  },
  gaming: {
    mode: "gaming",
    label: "Gaming",
    description:
      "Prioritizes game performance. Closes the apps you approved, switches to a high-performance power plan, and reduces NEXUS's own footprint.",
    manageBackgroundApps: true,
    backgroundAppAllowlist: [],
    powerProfile: "high-performance",
    suppressNotifications: true,
    launchTargetId: null,
  },
  media: {
    mode: "media",
    label: "Media",
    description: "Optimized for the media workspace with notifications suppressed and a darker environment.",
    manageBackgroundApps: false,
    backgroundAppAllowlist: [],
    powerProfile: "balanced",
    suppressNotifications: true,
    launchTargetId: null,
  },
  work: {
    mode: "work",
    label: "Work",
    description: "Clean productivity profile with a neutral environment.",
    manageBackgroundApps: false,
    backgroundAppAllowlist: [],
    powerProfile: "balanced",
    suppressNotifications: false,
    launchTargetId: null,
  },
  focus: {
    mode: "focus",
    label: "Focus",
    description: "Deep focus. Suppresses notifications and subdues the environment.",
    manageBackgroundApps: false,
    backgroundAppAllowlist: [],
    powerProfile: "balanced",
    suppressNotifications: true,
    launchTargetId: null,
  },
};

let changeSeq = 0;
function change(kind: ModeChange["kind"], description: string, previousValue: string | null = null): ModeChange {
  return { id: `chg-${Date.now()}-${changeSeq++}`, kind, description, appliedAt: Date.now(), previousValue, restored: false };
}

export interface EnterModeOptions {
  /** When "observe", NEXUS records intended changes but performs none. */
  readonly safety: "observe" | "enabled";
  /** Effective allowlist: apps the user marked "close when gaming". */
  readonly approvedApps: readonly string[];
  /** Whether the machine exposes a switchable power plan. */
  readonly powerSupported?: boolean;
}

export type StepKind = ModeChange["kind"] | "environment" | "restore" | "performance";

/** A human-readable step shown in the transition overlay / preview. */
export interface ModeStep {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly kind: StepKind;
  /** Whether this step will actually mutate the system (vs. observe/no-op). */
  readonly live: boolean;
  /** Structured payload for the executor (e.g. app names). */
  readonly apps?: readonly string[];
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Build the ordered plan of steps for entering a mode. Pure and deterministic
 * so it can power both the preview ("Gaming Mode will:") and the actual run.
 *
 * SAFETY: process steps only ever target the user's approved apps. Protected /
 * unknown processes can never appear here because they can never be marked.
 */
export function planModeSteps(config: ModeConfig, opts: EnterModeOptions): ModeStep[] {
  const live = opts.safety === "enabled";
  const steps: ModeStep[] = [];

  steps.push({ id: "env", label: "Shift environment", detail: `Apply the ${config.label} ambience and layout.`, kind: "environment", live: true });

  if (config.mode === "gaming") {
    steps.push({ id: "perf", label: "Reduce NEXUS footprint", detail: "Lower ambient animation and telemetry polling while you play.", kind: "performance", live: true });
  }

  if (config.powerProfile && config.powerProfile !== "balanced") {
    const supported = opts.powerSupported !== false;
    steps.push({
      id: "power",
      label: "Power plan",
      detail: !supported
        ? "No switchable high-performance plan found on this machine — skipped."
        : live
          ? "Switch to the High performance plan. The previous plan is recorded and restored on exit."
          : "Would switch to the High performance plan (observe-only).",
      kind: "power-profile",
      live: live && supported,
    });
  }

  if (config.suppressNotifications) {
    steps.push({ id: "notif", label: "Quiet notifications", detail: "Suppress non-critical NEXUS notifications for this session.", kind: "notifications", live: true });
  }

  if (config.manageBackgroundApps) {
    const approved = [...new Set(opts.approvedApps.map(norm))].sort();
    if (approved.length > 0) {
      steps.push({
        id: "apps",
        label: `Close ${approved.length} approved app${approved.length === 1 ? "" : "s"}`,
        detail: `${approved.join(", ")} — graceful close, never force-killed${live ? "" : " (observe-only)"}`,
        kind: "process-stop",
        live,
        apps: approved,
      });
    } else {
      steps.push({ id: "apps-none", label: "Background apps", detail: "No apps marked “close when gaming”. Mark apps in System → Processes.", kind: "note", live: false });
    }
  }

  if (config.launchTargetId) {
    steps.push({ id: "launch", label: "Launch target", detail: `Start ${config.launchTargetId}.`, kind: "launch", live: true });
  }

  steps.push({ id: "record", label: "Record session state", detail: "Everything changed is written to a recoverable session file so it can be restored — even after a crash.", kind: "note", live: true });
  return steps;
}

/** Convert steps into the reversible change records stored on the session. */
export function stepsToChanges(steps: readonly ModeStep[], opts: EnterModeOptions): ModeChange[] {
  const observe = opts.safety === "observe";
  const prefix = observe ? "[observe] Would " : "";
  const out: ModeChange[] = [];
  for (const s of steps) {
    switch (s.kind) {
      case "power-profile":
        if (s.live || observe) out.push(change("power-profile", `${prefix}set power plan to High performance.`, "previous"));
        break;
      case "notifications":
        out.push(change("notifications", "Suppressed notifications.", "on"));
        break;
      case "process-stop":
        for (const app of s.apps ?? []) out.push(change("process-stop", `${prefix}close approved app "${app}".`, "running"));
        break;
      case "launch":
        out.push(change("launch", `${prefix}launch target.`));
        break;
      default:
        break;
    }
  }
  return out;
}

/** Legacy helper kept for tests/compat: full plan → changes. */
export function planModeEntry(config: ModeConfig, opts: EnterModeOptions): ModeChange[] {
  return stepsToChanges(planModeSteps(config, opts), opts);
}

/** Produce the restored version of a set of changes (for exiting a mode). */
export function restoreChanges(changes: readonly ModeChange[]): ModeChange[] {
  return changes.map((c) => ({ ...c, restored: true }));
}

/** Steps shown when exiting a mode back to Normal. */
export function planRestoreSteps(changes: readonly ModeChange[]): ModeStep[] {
  const steps: ModeStep[] = [{ id: "env", label: "Restore environment", detail: "Return to the Normal ambience.", kind: "environment", live: true }];
  const kinds = new Set(changes.map((c) => c.kind));
  if (kinds.has("power-profile")) steps.push({ id: "power", label: "Restore power plan", detail: "Re-activate the plan that was active before.", kind: "restore", live: true });
  if (kinds.has("process-stop")) {
    const n = changes.filter((c) => c.kind === "process-stop").length;
    steps.push({ id: "apps", label: `${n} closed app${n === 1 ? "" : "s"}`, detail: "Closed apps are not relaunched automatically.", kind: "note", live: false });
  }
  if (kinds.has("notifications")) steps.push({ id: "notif", label: "Restore notifications", detail: "Re-enable notifications.", kind: "restore", live: true });
  steps.push({ id: "clear", label: "Clear session record", detail: "Nothing left to recover.", kind: "note", live: true });
  return steps;
}

/** Pick the high-performance scheme from `powercfg /list` output, if any. */
export function pickHighPerformanceScheme(schemes: readonly { guid: string; name: string; active: boolean }[]): { guid: string; name: string } | null {
  const byName = (re: RegExp) => schemes.find((s) => re.test(s.name.toLowerCase()));
  const s = byName(/ultimate performance/) ?? byName(/high performance/) ?? schemes.find((x) => x.guid.toLowerCase() === "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c");
  return s ? { guid: s.guid, name: s.name } : null;
}
