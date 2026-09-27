import type {
  DriveInfo,
  ProcessInfo,
  StartupApp,
  TelemetrySnapshot,
} from "@/core/types";
import {
  DEMO_DRIVES,
  DEMO_PROCESSES,
  DEMO_STARTUP,
  demoTelemetry,
} from "@/core/demo/system";
import { useDevStore } from "@/state/devStore";
import type { SystemProvider } from "./SystemProvider";

export class MockSystemProvider implements SystemProvider {
  readonly id = "mock-system";
  private tick = Math.floor(Math.random() * 100);

  async getTelemetry(): Promise<TelemetrySnapshot> {
    const dev = useDevStore.getState();
    if (!dev.telemetryAvailable) throw new Error("Telemetry unavailable (simulated)");
    this.tick += 1;
    return demoTelemetry(this.tick, {
      highCpu: dev.highCpu,
      highRam: dev.highRam,
      storagePressure: dev.storagePressure,
    });
  }

  async getDrives(): Promise<readonly DriveInfo[]> {
    return DEMO_DRIVES;
  }

  async getProcesses(): Promise<readonly ProcessInfo[]> {
    // Add a touch of jitter to CPU values for a live feel.
    return DEMO_PROCESSES.map((p) => ({
      ...p,
      cpuPercent: Math.max(0, +(p.cpuPercent + (Math.random() - 0.5)).toFixed(1)),
    }));
  }

  async getStartupApps(): Promise<readonly StartupApp[]> {
    return DEMO_STARTUP;
  }
}
