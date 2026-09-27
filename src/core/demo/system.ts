import type {
  DriveInfo,
  ProcessInfo,
  StartupApp,
  TelemetrySnapshot,
  HealthStatus,
} from "@/core/types";

const GB = 1024 ** 3;

export const DEMO_DRIVES: readonly DriveInfo[] = [
  {
    mountPoint: "C:\\",
    label: "System",
    kind: "fixed",
    totalBytes: 1000 * GB,
    freeBytes: 320 * GB,
    fileSystem: "NTFS",
    eligibleForScan: true,
  },
  {
    mountPoint: "D:\\",
    label: "Games",
    kind: "fixed",
    totalBytes: 2000 * GB,
    freeBytes: 800 * GB,
    fileSystem: "NTFS",
    eligibleForScan: true,
  },
  {
    // Removable — must be excluded from automatic scanning/cleanup.
    mountPoint: "X:\\",
    label: "Media (Removable)",
    kind: "removable",
    totalBytes: 4000 * GB,
    freeBytes: 1200 * GB,
    fileSystem: "exFAT",
    eligibleForScan: false,
  },
];

/**
 * Deterministic-ish demo telemetry with gentle animated drift so the UI feels
 * alive without pretending to be real measurements.
 */
export function demoTelemetry(tick: number): TelemetrySnapshot {
  const wave = (period: number, phase = 0) =>
    (Math.sin((tick / period) * Math.PI * 2 + phase) + 1) / 2;

  const cpu = Math.round(5 + wave(30) * 22 + wave(7, 1) * 8);
  const gpuUse = Math.round(2 + wave(40, 2) * 18);
  const memPercent = Math.round(29 + wave(90) * 8);
  const totalMem = 32 * GB;

  const health: HealthStatus =
    memPercent > 85
      ? "high-memory"
      : cpu > 90
        ? "attention"
        : "nominal";

  return {
    timestamp: Date.now(),
    cpu: {
      usagePercent: cpu,
      cores: 16,
      name: "AMD Ryzen 9 7900X",
      perCore: Array.from({ length: 16 }, (_, i) =>
        Math.round(Math.max(0, cpu + Math.sin(tick / 5 + i) * 18)),
      ),
      temperatureC: Math.round(48 + wave(30) * 14),
    },
    gpu: {
      name: "NVIDIA GeForce RTX 4080",
      usagePercent: gpuUse,
      memoryUsedMb: Math.round(2400 + wave(50) * 1800),
      memoryTotalMb: 16384,
      temperatureC: Math.round(42 + wave(45) * 12),
    },
    memory: {
      usedBytes: Math.round(totalMem * (memPercent / 100)),
      totalBytes: totalMem,
      usagePercent: memPercent,
    },
    storage: DEMO_DRIVES,
    network: {
      downBytesPerSec: Math.round(wave(12) * 4_500_000),
      upBytesPerSec: Math.round(wave(9, 2) * 900_000),
      online: true,
      ssidOrInterface: "Ethernet",
    },
    uptimeSeconds: 3 * 3600 + 42 * 60 + (tick % 60),
    health,
  };
}

export const DEMO_PROCESSES: readonly ProcessInfo[] = [
  { pid: 4, name: "System", cpuPercent: 0.3, memoryBytes: 24 * 1024 ** 2, classification: "system-critical", publisher: "Microsoft", path: null, managed: false },
  { pid: 892, name: "csrss.exe", cpuPercent: 0.1, memoryBytes: 6 * 1024 ** 2, classification: "system-critical", publisher: "Microsoft", path: "C:\\Windows\\System32\\csrss.exe", managed: false },
  { pid: 1204, name: "MsMpEng.exe", cpuPercent: 1.8, memoryBytes: 210 * 1024 ** 2, classification: "security", publisher: "Microsoft Defender", path: null, managed: false },
  { pid: 2210, name: "nvcontainer.exe", cpuPercent: 0.6, memoryBytes: 88 * 1024 ** 2, classification: "driver", publisher: "NVIDIA", path: "C:\\Program Files\\NVIDIA Corporation\\nvcontainer.exe", managed: false },
  { pid: 3312, name: "steam.exe", cpuPercent: 2.1, memoryBytes: 340 * 1024 ** 2, classification: "user-application", publisher: "Valve", path: "C:\\Program Files (x86)\\Steam\\steam.exe", managed: true },
  { pid: 3990, name: "chrome.exe", cpuPercent: 6.4, memoryBytes: 1240 * 1024 ** 2, classification: "user-application", publisher: "Google", path: "C:\\Program Files\\Google\\Chrome\\chrome.exe", managed: false },
  { pid: 4102, name: "Discord.exe", cpuPercent: 3.2, memoryBytes: 480 * 1024 ** 2, classification: "user-application", publisher: "Discord Inc.", path: null, managed: true },
  { pid: 4550, name: "Spotify.exe", cpuPercent: 1.1, memoryBytes: 260 * 1024 ** 2, classification: "user-application", publisher: "Spotify AB", path: null, managed: true },
  { pid: 5001, name: "RazerCentral.exe", cpuPercent: 0.9, memoryBytes: 120 * 1024 ** 2, classification: "hardware", publisher: "Razer", path: null, managed: false },
  { pid: 6120, name: "Code.exe", cpuPercent: 4.7, memoryBytes: 720 * 1024 ** 2, classification: "user-application", publisher: "Microsoft", path: null, managed: false },
  { pid: 7233, name: "svc_helper_x.exe", cpuPercent: 0.2, memoryBytes: 14 * 1024 ** 2, classification: "unknown", publisher: null, path: null, managed: false },
  { pid: 8080, name: "OptionalTray.exe", cpuPercent: 0.0, memoryBytes: 9 * 1024 ** 2, classification: "optional", publisher: "Generic Software", path: null, managed: false },
];

export const DEMO_STARTUP: readonly StartupApp[] = [
  { id: "su-steam", name: "Steam", publisher: "Valve", command: "steam.exe -silent", enabled: true, impact: "medium" },
  { id: "su-discord", name: "Discord", publisher: "Discord Inc.", command: "Update.exe --processStart Discord.exe", enabled: true, impact: "high" },
  { id: "su-spotify", name: "Spotify", publisher: "Spotify AB", command: "Spotify.exe /minimized", enabled: false, impact: "medium" },
  { id: "su-nvidia", name: "NVIDIA App", publisher: "NVIDIA", command: "nvcontainer.exe", enabled: true, impact: "low" },
  { id: "su-razer", name: "Razer Synapse", publisher: "Razer", command: "RazerCentral.exe", enabled: true, impact: "medium" },
  { id: "su-onedrive", name: "OneDrive", publisher: "Microsoft", command: "OneDrive.exe /background", enabled: true, impact: "low" },
];
