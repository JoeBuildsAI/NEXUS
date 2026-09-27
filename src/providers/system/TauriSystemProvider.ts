import type {
  DriveInfo,
  ProcessInfo,
  StartupApp,
  TelemetrySnapshot,
} from "@/core/types";
import type { SystemProvider } from "./SystemProvider";
import { classifyProcess } from "@/core/safety/processClassifier";
import { MockSystemProvider } from "./MockSystemProvider";

/**
 * Real Windows telemetry via Tauri/Rust commands. Falls back to the mock
 * provider for any capability the native layer doesn't yet implement, so the UI
 * is never blocked. Classification is applied client-side from the raw process
 * name/publisher returned by Rust.
 */
export class TauriSystemProvider implements SystemProvider {
  readonly id = "tauri-system";
  private fallback = new MockSystemProvider();

  private async invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  }

  async getTelemetry(): Promise<TelemetrySnapshot> {
    try {
      return await this.invoke<TelemetrySnapshot>("get_telemetry");
    } catch (err) {
      console.warn("[TauriSystemProvider] get_telemetry failed, using fallback", err);
      return this.fallback.getTelemetry();
    }
  }

  async getDrives(): Promise<readonly DriveInfo[]> {
    try {
      return await this.invoke<DriveInfo[]>("get_drives");
    } catch (err) {
      console.warn("[TauriSystemProvider] get_drives failed, using fallback", err);
      return this.fallback.getDrives();
    }
  }

  async getProcesses(): Promise<readonly ProcessInfo[]> {
    try {
      const raw = await this.invoke<
        Array<Omit<ProcessInfo, "classification" | "managed"> & { managed?: boolean }>
      >("get_processes");
      return raw.map((p) => ({
        ...p,
        classification: classifyProcess(p.name, p.publisher),
        managed: p.managed ?? false,
      }));
    } catch (err) {
      console.warn("[TauriSystemProvider] get_processes failed, using fallback", err);
      return this.fallback.getProcesses();
    }
  }

  async getStartupApps(): Promise<readonly StartupApp[]> {
    try {
      return await this.invoke<StartupApp[]>("get_startup_apps");
    } catch (err) {
      console.warn("[TauriSystemProvider] get_startup_apps failed, using fallback", err);
      return this.fallback.getStartupApps();
    }
  }
}
