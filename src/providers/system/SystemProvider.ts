import type {
  DriveInfo,
  ProcessInfo,
  StartupApp,
  TelemetrySnapshot,
} from "@/core/types";

/**
 * Abstraction over Windows system telemetry and safe system operations.
 *
 * Implementations MUST honor NEXUS safety rules:
 *  - never enumerate/scan removable drives unless explicitly authorized
 *  - never terminate/suspend processes outside an explicit allowlist
 *  - all mutating operations are gated behind explicit, predefined commands
 */
export interface SystemProvider {
  readonly id: string;
  getTelemetry(): Promise<TelemetrySnapshot>;
  getDrives(): Promise<readonly DriveInfo[]>;
  getProcesses(): Promise<readonly ProcessInfo[]>;
  getStartupApps(): Promise<readonly StartupApp[]>;
}

export type TelemetryListener = (snapshot: TelemetrySnapshot) => void;
