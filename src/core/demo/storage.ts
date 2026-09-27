import type { CleanupCandidate, StorageAnalysis } from "@/core/types";

const GB = 1024 ** 3;
const MB = 1024 ** 2;

/**
 * Bounded/safe demo analysis. Real analysis on the gaming PC will use known
 * locations (Steam libraries, Program Files, user folders, temp) rather than a
 * recursive whole-drive scan; anything outside those is "not analyzed".
 */
export function demoStorageAnalysis(drive: string, totalBytes?: number, freeBytes?: number): StorageAnalysis {
  const total = totalBytes ?? (drive.startsWith("D") ? 2000 * GB : 1000 * GB);
  const free = freeBytes ?? (drive.startsWith("D") ? 800 * GB : 320 * GB);
  const used = Math.max(0, total - free);
  const isSystem = drive.toUpperCase().startsWith("C");
  return {
    drive,
    totalBytes: total,
    usedBytes: used,
    freeBytes: free,
    analyzedAt: Date.now(),
    categories: isSystem
      ? [
          { category: "system", bytes: used * 0.22, itemCount: 1, confidence: "known" },
          { category: "applications", bytes: used * 0.24, itemCount: 96, confidence: "known" },
          { category: "games", bytes: used * 0.18, itemCount: 6, confidence: "known" },
          { category: "documents", bytes: used * 0.06, itemCount: 5400, confidence: "estimated" },
          { category: "downloads", bytes: used * 0.05, itemCount: 210, confidence: "known" },
          { category: "media", bytes: used * 0.07, itemCount: 820, confidence: "estimated" },
          { category: "temporary", bytes: used * 0.04, itemCount: 8900, confidence: "known" },
          { category: "other", bytes: used * 0.14, itemCount: 0, confidence: "not-analyzed" },
        ]
      : [
          { category: "games", bytes: used * 0.66, itemCount: 24, confidence: "known" },
          { category: "media", bytes: used * 0.12, itemCount: 1820, confidence: "estimated" },
          { category: "applications", bytes: used * 0.08, itemCount: 12, confidence: "known" },
          { category: "downloads", bytes: used * 0.03, itemCount: 40, confidence: "known" },
          { category: "other", bytes: used * 0.11, itemCount: 0, confidence: "not-analyzed" },
        ],
  };
}

export const DEMO_CLEANUP_CANDIDATES: readonly CleanupCandidate[] = [
  { id: "cl-temp", label: "Windows Temp files", description: "Temporary files older than 7 days in %TEMP% and C:\\Windows\\Temp. Windows and apps recreate these as needed.", bytes: 4.2 * GB, risk: "safe", category: "temporary", approved: false },
  { id: "cl-cache-shader", label: "GPU shader caches", description: "Rebuildable DirectX/NVIDIA shader caches. Games regenerate them on next launch (brief stutter possible).", bytes: 2.1 * GB, risk: "safe", category: "temporary", approved: false },
  { id: "cl-crash", label: "Crash dumps & error reports", description: "Windows Error Reporting archives and application crash dumps. Only useful for debugging past crashes.", bytes: 820 * MB, risk: "safe", category: "temporary", approved: false },
  { id: "cl-browser", label: "Browser caches", description: "Cached web assets for Chrome and Edge. Sites will load slightly slower once, then rebuild.", bytes: 1.9 * GB, risk: "safe", category: "temporary", approved: false },
  { id: "cl-recycle", label: "Recycle Bin", description: "Items you deleted but haven't emptied. Review the contents first — this is the last chance to restore them.", bytes: 3.6 * GB, risk: "review", category: "other", approved: false },
  { id: "cl-installers", label: "Old installer caches", description: "Downloaded installers and update packages that appear already applied. Review in case you want to keep an installer.", bytes: 6.8 * GB, risk: "review", category: "downloads", approved: false },
  { id: "cl-downloads-old", label: "Downloads folder — items older than 90 days", description: "Your own files. NEXUS will not label these safe; review each before removing.", bytes: 12.4 * GB, risk: "destructive", category: "downloads", approved: false },
];
