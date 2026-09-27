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
      "Prioritizes game performance. Optionally suspends allowlisted background apps and switches to a high-performance power profile.",
    manageBackgroundApps: true,
    backgroundAppAllowlist: ["Spotify.exe", "Discord.exe"],
    powerProfile: "high-performance",
    suppressNotifications: true,
    launchTargetId: null,
  },
  media: {
    mode: "media",
    label: "Media",
    description: "Optimized for the media workspace with notifications suppressed.",
    manageBackgroundApps: false,
    backgroundAppAllowlist: [],
    powerProfile: "balanced",
    suppressNotifications: true,
    launchTargetId: null,
  },
  work: {
    mode: "work",
    label: "Work",
    description: "Focused productivity profile.",
    manageBackgroundApps: false,
    backgroundAppAllowlist: [],
    powerProfile: "balanced",
    suppressNotifications: false,
    launchTargetId: null,
  },
  focus: {
    mode: "focus",
    label: "Focus",
    description: "Deep focus. Suppresses notifications and minimizes distractions.",
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
  /** User's approved background apps (the only apps eligible for suspend). */
  readonly approvedApps: readonly string[];
}

/**
 * Compute the changes NEXUS would (or does) make when entering a mode.
 *
 * SAFETY: In "observe" mode every entry is a "note" — nothing is suspended,
 * stopped, or reconfigured. Even in "enabled" mode, process actions are limited
 * to the intersection of the mode's allowlist and the user's approved apps; no
 * other process is ever touched, and UNKNOWN/critical processes are never in
 * scope because they never appear on the allowlist.
 */
export function planModeEntry(
  config: ModeConfig,
  opts: EnterModeOptions,
): ModeChange[] {
  const changes: ModeChange[] = [];
  const observe = opts.safety === "observe";
  const prefix = observe ? "[observe] Would " : "";

  if (config.powerProfile && config.powerProfile !== "balanced") {
    changes.push(
      change(
        "power-profile",
        `${prefix}set Windows power profile to "${config.powerProfile}".`,
        "balanced",
      ),
    );
  }

  if (config.suppressNotifications) {
    changes.push(
      change("notifications", `${prefix}suppress selected notifications.`, "on"),
    );
  }

  if (config.manageBackgroundApps) {
    const eligible = config.backgroundAppAllowlist.filter((a) =>
      opts.approvedApps.includes(a),
    );
    for (const app of eligible) {
      changes.push(
        change("process-suspend", `${prefix}suspend allowlisted app "${app}".`, "running"),
      );
    }
  }

  if (config.launchTargetId) {
    changes.push(change("launch", `${prefix}launch target "${config.launchTargetId}".`));
  }

  return changes;
}

/** Produce the restored version of a set of changes (for exiting a mode). */
export function restoreChanges(changes: readonly ModeChange[]): ModeChange[] {
  return changes.map((c) => ({ ...c, restored: true }));
}
