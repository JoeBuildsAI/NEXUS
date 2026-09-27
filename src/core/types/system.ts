/** System telemetry and process domain models. */

export type HealthStatus =
  | "nominal"
  | "attention"
  | "storage-pressure"
  | "high-memory"
  | "critical";

export interface TelemetrySnapshot {
  readonly timestamp: number;
  readonly cpu: CpuTelemetry;
  readonly gpu: GpuTelemetry | null;
  readonly memory: MemoryTelemetry;
  readonly storage: readonly DriveInfo[];
  readonly network: NetworkTelemetry;
  readonly uptimeSeconds: number;
  readonly processCount: number;
  readonly health: HealthStatus;
}

/** A launchable application discovered through safe Windows mechanisms. */
export interface AppEntry {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly source: "start-menu" | "start-menu-user" | "builtin" | "mock" | "user";
}

export interface CpuTelemetry {
  /** 0-100 aggregate utilization. */
  readonly usagePercent: number;
  readonly cores: number;
  readonly name: string;
  /** Per-core utilization 0-100, may be empty if unavailable. */
  readonly perCore: readonly number[];
  readonly temperatureC: number | null;
}

export interface GpuTelemetry {
  readonly name: string;
  readonly usagePercent: number;
  readonly memoryUsedMb: number;
  readonly memoryTotalMb: number;
  readonly temperatureC: number | null;
}

export interface MemoryTelemetry {
  readonly usedBytes: number;
  readonly totalBytes: number;
  readonly usagePercent: number;
}

export interface NetworkTelemetry {
  readonly downBytesPerSec: number;
  readonly upBytesPerSec: number;
  readonly online: boolean;
  readonly ssidOrInterface: string | null;
}

export type DriveKind = "fixed" | "removable" | "network" | "unknown";

export interface DriveInfo {
  readonly mountPoint: string;
  readonly label: string;
  readonly kind: DriveKind;
  readonly totalBytes: number;
  readonly freeBytes: number;
  readonly fileSystem: string | null;
  /** Removable drives are excluded from automatic scanning/cleanup. */
  readonly eligibleForScan: boolean;
}

/**
 * Safety classification for a process. UNKNOWN and SYSTEM_CRITICAL classes
 * must NEVER be automatically terminated or suspended.
 */
export type ProcessClass =
  | "system-critical"
  | "driver"
  | "security"
  | "hardware"
  | "user-application"
  | "optional"
  | "unknown";

export interface ProcessInfo {
  readonly pid: number;
  readonly name: string;
  readonly cpuPercent: number;
  readonly memoryBytes: number;
  readonly classification: ProcessClass;
  readonly publisher: string | null;
  readonly path: string | null;
  /** True only if the user has explicitly allowlisted this for mgmt. */
  readonly managed: boolean;
}

export interface StartupApp {
  readonly id: string;
  readonly name: string;
  readonly publisher: string | null;
  readonly command: string;
  readonly enabled: boolean;
  readonly impact: "low" | "medium" | "high" | "unknown";
}
