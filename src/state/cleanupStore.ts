import { create } from "zustand";
import { config } from "@/core/config";
import { DEMO_CLEANUP_CANDIDATES } from "@/core/demo/storage";
import { native, type CleanupReportItem, type NativeCleanupCandidate } from "@/providers/system/nativeBridge";
import type { CleanupRisk } from "@/core/types";
import { activity } from "./activityStore";
import { formatBytes } from "@/lib/utils";

export interface CleanupCandidateView {
  id: string;
  label: string;
  description: string;
  bytes: number;
  fileCount: number | null;
  risk: CleanupRisk;
  requiresElevation: boolean;
  discovery: string | null;
  execution: string | null;
}

interface CleanupState {
  candidates: CleanupCandidateView[] | null;
  discoveredAt: number | null;
  discovering: boolean;
  /** Whether the numbers come from the native engine (true) or demo data. */
  real: boolean;
  lastReport: CleanupReportItem[] | null;
  discover: (opts?: { force?: boolean }) => Promise<void>;
  execute: (ruleIds: string[], dryRun: boolean) => Promise<CleanupReportItem[]>;
  /** Bytes across candidates that are not user files. */
  reviewableBytes: () => number;
}

const STALE_MS = 10 * 60_000;

const fromNative = (c: NativeCleanupCandidate): CleanupCandidateView => ({
  id: c.rule.id, label: c.rule.label, description: c.rule.description, bytes: c.bytes, fileCount: c.fileCount,
  risk: c.rule.risk, requiresElevation: c.rule.requiresElevation, discovery: c.rule.discovery, execution: c.rule.execution,
});

/**
 * Single source of truth for cleanup discovery so Home, insights and the
 * Storage screen agree — and so demo figures never appear on a real machine.
 */
export const useCleanupStore = create<CleanupState>((set, get) => ({
  candidates: null,
  discoveredAt: null,
  discovering: false,
  real: config.isTauri,
  lastReport: null,

  discover: async ({ force } = {}) => {
    const { discovering, discoveredAt } = get();
    if (discovering) return;
    if (!force && discoveredAt && Date.now() - discoveredAt < STALE_MS) return;
    set({ discovering: true });
    try {
      if (config.isTauri) {
        const list = await native.cleanupDiscover();
        set({ candidates: (list ?? []).filter((c) => c.accessible || c.rule.id === "recycle-bin").map(fromNative), discoveredAt: Date.now(), real: true });
      } else {
        set({
          candidates: DEMO_CLEANUP_CANDIDATES.map((c) => ({ id: c.id, label: c.label, description: c.description, bytes: c.bytes, fileCount: null, risk: c.risk, requiresElevation: false, discovery: null, execution: null })),
          discoveredAt: Date.now(),
          real: false,
        });
      }
    } finally {
      set({ discovering: false });
    }
  },

  execute: async (ruleIds, dryRun) => {
    const report = await native.cleanupExecute(ruleIds, dryRun);
    set({ lastReport: report });
    if (!dryRun) {
      const freed = report.reduce((s, r) => s + r.freedBytes, 0);
      activity.record("cleanup-completed", `Cleanup recovered ${formatBytes(freed)} across ${ruleIds.length} rule${ruleIds.length === 1 ? "" : "s"}`);
      await get().discover({ force: true });
    }
    return report;
  },

  reviewableBytes: () => (get().candidates ?? []).filter((c) => c.risk !== "destructive").reduce((s, c) => s + c.bytes, 0),
}));
