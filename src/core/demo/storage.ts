import type { CleanupCandidate, StorageAnalysis } from "@/core/types";

const GB = 1024 ** 3;
const MB = 1024 ** 2;

export function demoStorageAnalysis(drive: string): StorageAnalysis {
  const total = drive.startsWith("D") ? 2000 * GB : 1000 * GB;
  const free = drive.startsWith("D") ? 800 * GB : 320 * GB;
  const used = total - free;
  return {
    drive,
    totalBytes: total,
    usedBytes: used,
    freeBytes: free,
    analyzedAt: Date.now(),
    categories: [
      { category: "games", bytes: used * 0.52, itemCount: 24 },
      { category: "media", bytes: used * 0.14, itemCount: 1820 },
      { category: "applications", bytes: used * 0.12, itemCount: 96 },
      { category: "system", bytes: used * 0.09, itemCount: 1 },
      { category: "documents", bytes: used * 0.05, itemCount: 5400 },
      { category: "downloads", bytes: used * 0.04, itemCount: 210 },
      { category: "temporary", bytes: used * 0.025, itemCount: 8900 },
      { category: "other", bytes: used * 0.015, itemCount: 640 },
    ],
  };
}

export const DEMO_CLEANUP_CANDIDATES: readonly CleanupCandidate[] = [
  { id: "cl-temp", label: "Windows Temp files", description: "Temporary files older than 7 days in %TEMP% and C:\\Windows\\Temp.", bytes: 4.2 * GB, risk: "safe", category: "temporary", approved: false },
  { id: "cl-cache-shader", label: "GPU shader caches", description: "Rebuildable DirectX/NVIDIA shader caches. Safe to clear; games regenerate them.", bytes: 2.1 * GB, risk: "safe", category: "temporary", approved: false },
  { id: "cl-recycle", label: "Recycle Bin", description: "Items currently in the Recycle Bin across eligible fixed drives.", bytes: 3.6 * GB, risk: "review", category: "other", approved: false },
  { id: "cl-crash", label: "Crash dumps & error reports", description: "Windows Error Reporting archives and application crash dumps.", bytes: 820 * MB, risk: "safe", category: "temporary", approved: false },
  { id: "cl-installers", label: "Old installer caches", description: "Downloaded installers and update packages no longer needed.", bytes: 6.8 * GB, risk: "review", category: "downloads", approved: false },
  { id: "cl-browser", label: "Browser caches", description: "Cached web assets for Chrome and Edge. Understood and safe to clear.", bytes: 1.9 * GB, risk: "safe", category: "temporary", approved: false },
  { id: "cl-downloads-old", label: "Downloads folder — items >90 days", description: "User content in Downloads. Review before removing — may contain files you want.", bytes: 12.4 * GB, risk: "destructive", category: "downloads", approved: false },
];
