/** Operating mode / profile domain models. */

export type OperatingMode = "normal" | "gaming" | "media" | "work" | "focus";

/** A single reversible change NEXUS made when entering a mode. */
export interface ModeChange {
  readonly id: string;
  readonly kind:
    | "power-profile"
    | "notifications"
    | "process-suspend"
    | "process-stop"
    | "launch"
    | "note";
  readonly description: string;
  readonly appliedAt: number;
  readonly previousValue: string | null;
  readonly restored: boolean;
}

export interface ModeConfig {
  readonly mode: OperatingMode;
  readonly label: string;
  readonly description: string;
  /** Whether NEXUS may act on the allowlist of background apps. */
  readonly manageBackgroundApps: boolean;
  /** Names of user-approved apps that may be suspended/stopped. Allowlist only. */
  readonly backgroundAppAllowlist: readonly string[];
  readonly powerProfile: "balanced" | "high-performance" | "power-saver" | null;
  readonly suppressNotifications: boolean;
  /** Optional launcher/game to start when entering the mode. */
  readonly launchTargetId: string | null;
}

export interface ModeSession {
  readonly mode: OperatingMode;
  readonly enteredAt: number;
  readonly changes: readonly ModeChange[];
}
