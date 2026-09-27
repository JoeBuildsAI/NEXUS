import type { Message, MessageCategory } from "@/core/types";
import { LOW_VALUE_CATEGORIES } from "./classify";

/**
 * Email cleanup transactions: DISCOVER → PROPOSE → REVIEW → APPROVE → EXECUTE →
 * VERIFY → REPORT. Plans are pure data; execution goes through an executor
 * that reports per-batch success/failure. Partial failure is first-class.
 */
export type CleanupOp = "archive" | "trash" | "markRead";

export interface CleanupGroup {
  key: string;
  accountId: string;
  label: string;
  /** Sender/list identity (address or List-Id). Never message content. */
  senderAddress: string;
  category: MessageCategory;
  messageIds: string[];
  unread: number;
  oldestAt: number;
  newestAt: number;
  op: CleanupOp;
  /** "recoverable" (trash/archive) vs "none" (mark read never destroys). */
  reversibility: "recoverable" | "none";
  approved: boolean;
}

export interface CleanupPlan {
  createdAt: number;
  groups: CleanupGroup[];
  /** Provider limitations surfaced at review time. */
  notes: string[];
}

export interface CleanupOptions {
  /** Messages older than this many days are candidates (default 30). */
  olderThanDays?: number;
  /** Only these categories (default: low-value set). */
  categories?: readonly MessageCategory[];
  /** Default operation (default archive — prefer over delete). */
  op?: CleanupOp;
  /** Minimum messages per sender to propose a group (default 2). */
  minGroup?: number;
  now?: number;
}

/** DISCOVER + PROPOSE: group low-value, aged messages by sender per account. */
export function proposeCleanup(messages: readonly Message[], opts: CleanupOptions = {}): CleanupPlan {
  const now = opts.now ?? Date.now();
  const cutoff = now - (opts.olderThanDays ?? 30) * 86400_000;
  const cats = new Set(opts.categories ?? LOW_VALUE_CATEGORIES);
  const op = opts.op ?? "archive";
  const minGroup = opts.minGroup ?? 2;
  const byKey = new Map<string, CleanupGroup>();
  for (const m of messages) {
    if (m.archived || !cats.has(m.category) || m.timestamp > cutoff) continue;
    const sender = m.senderAddress.toLowerCase();
    const key = `${m.accountId}|${sender}`;
    const g = byKey.get(key) ?? { key, accountId: m.accountId, label: m.sender, senderAddress: sender, category: m.category, messageIds: [], unread: 0, oldestAt: m.timestamp, newestAt: m.timestamp, op, reversibility: op === "markRead" ? "none" : "recoverable", approved: false };
    g.messageIds.push(m.id);
    if (!m.read) g.unread++;
    g.oldestAt = Math.min(g.oldestAt, m.timestamp);
    g.newestAt = Math.max(g.newestAt, m.timestamp);
    byKey.set(key, g);
  }
  const groups = [...byKey.values()].filter((g) => g.messageIds.length >= minGroup).sort((a, b) => b.messageIds.length - a.messageIds.length);
  const notes = [
    op === "trash" ? "Trash is recoverable for a limited time (Gmail 30 days; Outlook per mailbox policy)." : "Archive removes messages from the inbox without deleting them.",
    "Only messages already loaded by NEXUS are counted — totals are KNOWN for those, not for the whole mailbox.",
  ];
  return { createdAt: now, groups, notes };
}

export interface CleanupBatch {
  accountId: string;
  op: CleanupOp;
  messageIds: string[];
}

export const BATCH_LIMITS: Record<"gmail" | "outlook" | "mock", number> = { gmail: 1000, outlook: 20, mock: 50 };

/** APPROVE → batches per account/op, respecting provider batch limits. */
export function planBatches(plan: CleanupPlan, providerOf: (accountId: string) => "gmail" | "outlook" | "mock"): CleanupBatch[] {
  const byAccountOp = new Map<string, string[]>();
  for (const g of plan.groups) {
    if (!g.approved) continue;
    const k = `${g.accountId}|${g.op}`;
    byAccountOp.set(k, [...(byAccountOp.get(k) ?? []), ...g.messageIds]);
  }
  const out: CleanupBatch[] = [];
  for (const [k, ids] of byAccountOp) {
    const [accountId, op] = k.split("|") as [string, CleanupOp];
    const limit = BATCH_LIMITS[providerOf(accountId)];
    for (let i = 0; i < ids.length; i += limit) out.push({ accountId, op, messageIds: ids.slice(i, i + limit) });
  }
  return out;
}

export interface BatchResult {
  batch: CleanupBatch;
  succeeded: number;
  failed: number;
  error?: string;
}

export interface CleanupReport {
  requested: number;
  succeeded: number;
  failed: number;
  results: BatchResult[];
  startedAt: number;
  finishedAt: number;
}

/** EXECUTE with per-batch accounting; never hides failures. */
export async function executeBatches(batches: CleanupBatch[], run: (b: CleanupBatch) => Promise<{ succeeded: number; failed: number; error?: string }>, onProgress?: (done: number, total: number) => void): Promise<CleanupReport> {
  const startedAt = Date.now();
  const results: BatchResult[] = [];
  let done = 0;
  for (const batch of batches) {
    try {
      const r = await run(batch);
      results.push({ batch, ...r });
    } catch (err) {
      results.push({ batch, succeeded: 0, failed: batch.messageIds.length, error: String((err as Error)?.message ?? err).slice(0, 160) });
    }
    done++;
    onProgress?.(done, batches.length);
  }
  const requested = batches.reduce((s, b) => s + b.messageIds.length, 0);
  return { requested, succeeded: results.reduce((s, r) => s + r.succeeded, 0), failed: results.reduce((s, r) => s + r.failed, 0), results, startedAt, finishedAt: Date.now() };
}

export function approvedTotals(plan: CleanupPlan): { groups: number; messages: number; unread: number } {
  const a = plan.groups.filter((g) => g.approved);
  return { groups: a.length, messages: a.reduce((s, g) => s + g.messageIds.length, 0), unread: a.reduce((s, g) => s + g.unread, 0) };
}
