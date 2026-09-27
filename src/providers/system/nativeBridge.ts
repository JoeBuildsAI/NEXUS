import { config } from "@/core/config";
import type { DriveInfo } from "@/core/types";

/**
 * Typed wrappers for native commands beyond the core providers. Every function
 * degrades gracefully outside Tauri (browser preview / tests) by returning a
 * typed "unsupported" result instead of throwing.
 */

export interface PowerScheme {
  guid: string;
  name: string;
  active: boolean;
}
export interface PowerState {
  supported: boolean;
  schemes: PowerScheme[];
  activeGuid: string | null;
}

export interface GpuCapability {
  name: string | null;
  vramTotalMb: number | null;
  driverVersion: string | null;
  utilizationSupported: boolean;
  temperatureSupported: boolean;
  memorySupported: boolean;
}
export interface HardwareInventory {
  cpuName: string;
  logicalCores: number;
  physicalCores: number | null;
  totalMemoryBytes: number;
  osName: string;
  osVersion: string;
  kernelVersion: string;
  arch: string;
  hostname: string;
  gpus: GpuCapability[];
  drives: DriveInfo[];
}

export interface SessionRecord {
  mode: string;
  startedAt: number;
  previousPowerGuid: string | null;
  closedApps: string[];
  startupChanges: { id: string; previousEnabled: boolean; changedAt: number }[];
}

export interface NativeCleanupCandidate {
  rule: { id: string; label: string; description: string; risk: "safe" | "review"; requiresElevation: boolean; discovery: string; execution: string };
  bytes: number;
  fileCount: number;
  accessible: boolean;
}
export interface CleanupReportItem {
  ruleId: string;
  freedBytes: number;
  removed: number;
  skipped: number;
  dryRun: boolean;
  error: string | null;
}

export interface NativeAnalysis {
  drive: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  categories: { category: string; bytes: number; itemCount: number; confidence: "known" | "estimated" | "not-analyzed" }[];
  analyzedAt: number;
  cancelled: boolean;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export const native = {
  available: () => config.isTauri,

  // ---- power ----
  async powerState(): Promise<PowerState> {
    if (!config.isTauri) return { supported: false, schemes: [], activeGuid: null };
    return invoke<PowerState>("power_get_state").catch(() => ({ supported: false, schemes: [], activeGuid: null }));
  },
  async powerSetActive(guid: string): Promise<boolean> {
    if (!config.isTauri) return false;
    return invoke<void>("power_set_active", { guid }).then(() => true).catch(() => false);
  },

  // ---- processes ----
  async closeGraceful(name: string): Promise<{ ok: boolean; count: number; error?: string }> {
    if (!config.isTauri) return { ok: true, count: 0 };
    try {
      const count = await invoke<number>("process_close_graceful", { name });
      return { ok: true, count };
    } catch (e) {
      return { ok: false, count: 0, error: String(e) };
    }
  },
  async runningUnder(installDir: string): Promise<boolean> {
    if (!config.isTauri) return false;
    return invoke<boolean>("process_running_under", { installDir }).catch(() => false);
  },

  // ---- session (crash recovery) ----
  async sessionRead(): Promise<SessionRecord | null> {
    if (!config.isTauri) return null;
    return invoke<SessionRecord | null>("session_read").catch(() => null);
  },
  async sessionWrite(record: SessionRecord): Promise<void> {
    if (!config.isTauri) return;
    await invoke<void>("session_write", { record }).catch(() => undefined);
  },
  async sessionClear(): Promise<void> {
    if (!config.isTauri) return;
    await invoke<void>("session_clear").catch(() => undefined);
  },

  // ---- hardware ----
  async hardware(refresh = false): Promise<HardwareInventory | null> {
    if (!config.isTauri) return null;
    return invoke<HardwareInventory>("get_hardware", { refresh }).catch(() => null);
  },

  // ---- startup ----
  async startupSetEnabled(id: string, enabled: boolean): Promise<{ ok: boolean; error?: string }> {
    if (!config.isTauri) return { ok: true };
    return invoke<boolean>("startup_set_enabled", { id, enabled }).then(() => ({ ok: true })).catch((e) => ({ ok: false, error: String(e) }));
  },

  // ---- secrets (never returns values) ----
  async secretStatus(keys: string[]): Promise<Record<string, boolean>> {
    if (!config.isTauri) return Object.fromEntries(keys.map((k) => [k, false]));
    const list = await invoke<{ key: string; configured: boolean }[]>("secret_status", { keys }).catch(() => []);
    return Object.fromEntries(keys.map((k) => [k, list.find((s) => s.key === k)?.configured ?? false]));
  },
  async secretSet(key: string, value: string): Promise<{ ok: boolean; error?: string }> {
    if (!config.isTauri) return { ok: false, error: "Secure storage requires the desktop build." };
    return invoke("secret_set", { key, value }).then(() => ({ ok: true })).catch((e) => ({ ok: false, error: String(e) }));
  },
  async secretDelete(key: string): Promise<boolean> {
    if (!config.isTauri) return false;
    return invoke("secret_delete", { key }).then(() => true).catch(() => false);
  },

  // ---- storage / cleanup ----
  async storageAnalyze(drive: string, steamLibraries: string[], onProgress: (c: { category: string; bytes: number }) => void): Promise<NativeAnalysis | null> {
    if (!config.isTauri) return null;
    const { listen } = await import("@tauri-apps/api/event");
    const unProgress = await listen<{ category: string; bytes: number }>("storage:progress", (e) => onProgress(e.payload));
    return new Promise<NativeAnalysis | null>((resolve) => {
      let unComplete: (() => void) | null = null;
      const finish = (v: NativeAnalysis | null) => {
        unProgress();
        unComplete?.();
        resolve(v);
      };
      void listen<NativeAnalysis>("storage:complete", (e) => finish(e.payload)).then((u) => (unComplete = u));
      invoke<void>("storage_analyze", { drive, steamLibraries }).catch(() => finish(null));
      setTimeout(() => finish(null), 120_000);
    });
  },
  async storageCancel(): Promise<void> {
    if (!config.isTauri) return;
    await invoke<void>("storage_cancel").catch(() => undefined);
  },
  async cleanupDiscover(): Promise<NativeCleanupCandidate[] | null> {
    if (!config.isTauri) return null;
    return invoke<NativeCleanupCandidate[]>("cleanup_discover").catch(() => null);
  },
  async cleanupExecute(ruleIds: string[], dryRun: boolean): Promise<CleanupReportItem[]> {
    if (!config.isTauri) return ruleIds.map((ruleId) => ({ ruleId, freedBytes: 0, removed: 0, skipped: 0, dryRun, error: "desktop build required" }));
    return invoke<CleanupReportItem[]>("cleanup_execute", { ruleIds, dryRun }).catch((e) => ruleIds.map((ruleId) => ({ ruleId, freedBytes: 0, removed: 0, skipped: 0, dryRun, error: String(e) })));
  },
};
