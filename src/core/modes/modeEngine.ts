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
      "Prioritizes game performance. Suspends allowlisted background apps and switches to a high-performance power profile.",
    manageBackgroundApps: true,
    backgroundAppAllowlist: ["Spotify.exe", "Discord.exe"],
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
function change(
  kind: ModeChange["kind"],
  description: string,
  previousValue: string | null = null,
): ModeChange {
  return {
    id: `chg-${Date.now()}-${changeSeq++}`,
    kind,
    description,
    appliedAt: Date.now(),
    previousValue,
    restored: false,
  };
}

export interface EnterModeOptions {
  /** When "observe", NEXUS records intended changes but performs none. */
  readonly safety: "observe" | "enabled";
  /** Effective allowlist: apps the user marked "allowed to suspend". */
  readonly approvedApps: readonly string[];
}

/** A human-readable step shown in the transition overlay / preview. */
export interface ModeStep {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly kind: ModeChange["kind"] | "environment" | "restore";
  /** Whether this step will actually mutate the system (vs. observe/no-op). */
  readonly live: boolean;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Build the ordered plan of steps for entering a mode. Pure and deterministic
 * so it can power both the preview ("Gaming Mode will:") and the actual run.
 *
 * SAFETY: process steps only ever target the intersection of the mode's
 * allowlist and the user's approved apps. Protected/unknown processes can never
 * appear here because they can never be on either list.
 */
export function planModeSteps(config: ModeConfig, opts: EnterModeOptions): ModeStep[] {
  const live = opts.safety === "enabled";
  const steps: ModeStep[] = [];

  steps.push({
    id: "env",
    label: "Shift environment",
    detail: `Apply the ${config.label} ambience and layout.`,
    kind: "environment",
    live: true,
  });

  if (config.powerProfile && config.powerProfile !== "balanced") {
    steps.push({
      id: "power",
      label: "Power profile",
      detail: live
        ? `Switch Windows power plan to ${config.powerProfile}.`
        : `Would switch power plan to ${config.powerProfile} (observe-only).`,
      kind: "power-profile",
      live,
    });
  }

  if (config.suppressNotifications) {
    steps.push({
      id: "notif",
      label: "Quiet notifications",
      detail: "Suppress non-critical NEXUS notifications for this session.",
      kind: "notifications",
      live: true,
    });
  }

  if (config.manageBackgroundApps) {
    const approved = new Set(opts.approvedApps.map(norm));
    const eligible = config.backgroundAppAllowlist.filter((a) => approved.has(norm(a)));
    if (eligible.length > 0) {
      steps.push({
        id: "apps",
        label: `Suspend ${eligible.length} approved app${eligible.length === 1 ? "" : "s"}`,
        detail: `${eligible.join(", ")}${live ? "" : " — recorded only (observe-only)"}`,
        kind: "process-suspend",
        live,
      });
    } else {
      steps.push({
        id: "apps-none",
        label: "Background apps",
        detail: "No approved apps to suspend. Mark apps in System → Processes.",
        kind: "note",
        live: false,
      });
    }
  }

  if (config.launchTargetId) {
    steps.push({
      id: "launch",
      label: "Launch target",
      detail: `Start ${config.launchTargetId}.`,
      kind: "launch",
      live: true,
    });
  }

  steps.push({
    id: "record",
    label: "Record session state",
    detail: "Everything changed is tracked so it can be restored on exit.",
    kind: "note",
    live: true,
  });

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
        out.push(change("power-profile", `${prefix}set power profile.`, "balanced"));
        break;
      case "notifications":
        out.push(change("notifications", "Suppressed notifications.", "on"));
        break;
      case "process-suspend":
        for (const app of s.detail.split(" — ")[0]!.split(",").map((a) => a.trim()).filter(Boolean)) {
          out.push(change("process-suspend", `${prefix}suspend allowlisted app "${app}".`, "running"));
        }
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
  const steps: ModeStep[] = [
    { id: "env", label: "Restore environment", detail: "Return to the Normal ambience.", kind: "environment", live: true },
  ];
  const kinds = new Set(changes.map((c) => c.kind));
  if (kinds.has("power-profile"))
    steps.push({ id: "power", label: "Restore power profile", detail: "Return to the previous power plan.", kind: "restore", live: true });
  if (kinds.has("process-suspend")) {
    const n = changes.filter((c) => c.kind === "process-suspend").length;
    steps.push({ id: "apps", label: `Resume ${n} app${n === 1 ? "" : "s"}`, detail: "Resume suspended background apps.", kind: "restore", live: true });
  }
  if (kinds.has("notifications"))
    steps.push({ id: "notif", label: "Restore notifications", detail: "Re-enable notifications.", kind: "restore", live: true });
  return steps;
}
