import { useMemo, useState } from "react";
import type { EmailAccount, Message } from "@/core/types";
import { approvedTotals, executeBatches, planBatches, proposeCleanup, type CleanupOp, type CleanupPlan, type CleanupReport } from "@/core/email/cleanup";
import { CATEGORY_LABEL } from "@/core/email/classify";
import { getProviders } from "@/providers";
import { activity } from "@/state/activityStore";
import { notify } from "@/state/toastStore";
import { Button } from "@/components/ui";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Props {
  messages: readonly Message[];
  accounts: readonly EmailAccount[];
  /** Restrict to these senders (Subscription manager → "archive existing"). */
  senders?: readonly string[];
  op?: CleanupOp;
  onClose: () => void;
  onChanged: () => void;
}

type Phase = "review" | "confirm" | "executing" | "report";

/**
 * Email cleanup as a transaction: PROPOSE → REVIEW (per sender, per account,
 * reversibility, provider notes) → APPROVE → EXECUTE in provider-sized
 * batches → REPORT with partial failures shown, never hidden.
 */
export function CleanupReview({ messages, accounts, senders, op: initialOp = "archive", onClose, onChanged }: Props) {
  const [op, setOp] = useState<CleanupOp>(initialOp);
  const [olderThan, setOlderThan] = useState(senders ? 0 : 30);
  const [plan, setPlan] = useState<CleanupPlan>(() => propose(messages, op, olderThan, senders));
  const [phase, setPhase] = useState<Phase>("review");
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [report, setReport] = useState<CleanupReport | null>(null);
  const totals = useMemo(() => approvedTotals(plan), [plan]);
  const accountLabel = (id: string) => { const a = accounts.find((x) => x.id === id); return a?.label ?? a?.displayName ?? id; };
  const providerOf = (id: string): "gmail" | "outlook" | "mock" => { const p = accounts.find((x) => x.id === id)?.provider; return p === "gmail" || p === "outlook" ? p : "mock"; };

  const rebuild = (nextOp: CleanupOp, nextOlder: number) => {
    setOp(nextOp);
    setOlderThan(nextOlder);
    setPlan(propose(messages, nextOp, nextOlder, senders));
  };
  const toggle = (key: string) => setPlan((p) => ({ ...p, groups: p.groups.map((g) => (g.key === key ? { ...g, approved: !g.approved } : g)) }));
  const setAll = (approved: boolean) => setPlan((p) => ({ ...p, groups: p.groups.map((g) => ({ ...g, approved })) }));

  const execute = async () => {
    setPhase("executing");
    const batches = planBatches(plan, providerOf);
    setProgress([0, batches.length]);
    const email = getProviders().email;
    const r = await executeBatches(batches, async (b) => (email.batch ? email.batch(b.accountId, b.messageIds, b.op) : { succeeded: 0, failed: b.messageIds.length, error: "bulk operations unavailable" }), (done, total) => setProgress([done, total]));
    setReport(r);
    setPhase("report");
    activity.record("email-cleanup-completed", `Inbox cleanup: ${r.succeeded.toLocaleString()} ${op === "trash" ? "deleted" : op === "archive" ? "archived" : "marked read"}${r.failed ? `, ${r.failed} failed` : ""}`);
    if (r.failed) notify.warn("Cleanup finished with failures", `${r.failed} of ${r.requested} operations did not complete.`);
    else notify.success("Cleanup complete", `${r.succeeded.toLocaleString()} messages ${op === "trash" ? "moved to trash" : op === "archive" ? "archived" : "marked read"}.`);
    onChanged();
  };

  if (phase === "report" && report) {
    const failedBatches = report.results.filter((r) => r.failed > 0);
    return (
      <div className="max-w-3xl">
        <p className="text-micro tracking-cinematic text-white/35">Cleanup report</p>
        <div className="mt-5 grid grid-cols-3 gap-8">
          <Stat n={report.requested} label="requested" />
          <Stat n={report.succeeded} label="succeeded" />
          <Stat n={report.failed} label="failed" tone={report.failed ? "attention" : undefined} />
        </div>
        <p className="mt-4 text-[13px] text-white/40">{op === "trash" ? "Trashed messages stay recoverable for a limited time in your provider." : op === "archive" ? "Archived messages are out of the inbox and fully recoverable." : "Read state changed only — nothing was moved."} Finished in {Math.max(1, Math.round((report.finishedAt - report.startedAt) / 1000))}s.</p>
        {failedBatches.length > 0 && (
          <div className="mt-8">
            <p className="label">What failed</p>
            <div className="rule mt-3 mb-1" />
            <ul>
              {failedBatches.map((r, i) => (
                <li key={i} className="flex items-baseline gap-4 py-2 text-[13px]">
                  <span className="font-mono text-[12px] tabular text-status-attention/80">{r.failed}</span>
                  <span className="text-white/70">{accountLabel(r.batch.accountId)} · {r.batch.op}</span>
                  <span className="ml-auto text-white/35">{r.error ?? "provider rejected part of the batch"}</span>
                </li>
              ))}
            </ul>
            <Button className="mt-5" size="sm" variant="outline" onClick={() => { setPlan(propose(messages, op, olderThan, senders)); setPhase("review"); }}>Retry with a fresh plan</Button>
          </div>
        )}
        <Button className="mt-8" variant="ghost" onClick={onClose}>Done</Button>
      </div>
    );
  }

  if (phase === "executing") {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
        <p className="text-micro tracking-cinematic text-white/35">Executing</p>
        <p className="mt-4 font-sans text-display-md font-semibold tabular text-white">{progress[0]} <span className="text-white/30">/ {progress[1]}</span></p>
        <p className="mt-2 text-[13px] text-white/40">batches · {totals.messages.toLocaleString()} messages</p>
      </div>
    );
  }

  if (phase === "confirm") {
    const byAccount = new Map<string, number>();
    for (const g of plan.groups) if (g.approved) byAccount.set(g.accountId, (byAccount.get(g.accountId) ?? 0) + g.messageIds.length);
    return (
      <div className="max-w-2xl">
        <p className="text-micro tracking-cinematic text-status-attention/80">You are about to {op === "trash" ? "delete" : op === "archive" ? "archive" : "mark read"}</p>
        <p className="mt-4 font-sans text-display-lg font-semibold tabular tracking-tight text-white">{totals.messages.toLocaleString()} <span className="text-[20px] font-normal text-white/40">messages</span></p>
        <ul className="mt-6 space-y-1 text-[13.5px] text-white/60">
          {[...byAccount.entries()].map(([id, n]) => <li key={id}><span className="font-mono tabular text-white/85">{n.toLocaleString()}</span> in {accountLabel(id)} ({providerOf(id)})</li>)}
          <li className="pt-2 text-white/40">{totals.groups} sender{totals.groups === 1 ? "" : "s"} · {totals.unread.toLocaleString()} unread among them</li>
          <li className="text-white/40">{op === "trash" ? "Recoverable from your provider's trash for a limited time." : op === "archive" ? "Reversible — archived mail is not deleted." : "Nothing is moved or deleted."}</li>
          {plan.notes.map((n) => <li key={n} className="text-white/30">{n}</li>)}
        </ul>
        <div className="mt-8 flex items-center gap-3">
          <Button variant={op === "trash" ? "danger" : "primary"} onClick={() => void execute()}>{op === "trash" ? "Delete" : op === "archive" ? "Archive" : "Mark read"} {totals.messages.toLocaleString()}</Button>
          <Button variant="ghost" onClick={() => setPhase("review")}>Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-micro tracking-cinematic text-white/35">Cleanup review</p>
          <p className="mt-2 text-[14px] text-white/50">Approve senders below. Nothing happens until you confirm.</p>
        </div>
        <div className="flex flex-wrap items-center gap-6 text-[12.5px]">
          <span className="flex items-center gap-3"><span className="text-white/35">Action</span>{(["archive", "trash", "markRead"] as CleanupOp[]).map((o) => <Opt key={o} on={op === o} onClick={() => rebuild(o, olderThan)} danger={o === "trash"}>{o === "archive" ? "Archive" : o === "trash" ? "Delete" : "Mark read"}</Opt>)}</span>
          {!senders && <span className="flex items-center gap-3"><span className="text-white/35">Older than</span>{[7, 30, 90, 365].map((d) => <Opt key={d} on={olderThan === d} onClick={() => rebuild(op, d)}>{d === 365 ? "1 year" : `${d} days`}</Opt>)}</span>}
        </div>
      </div>
      <div className="rule mt-5 mb-1" />
      <div className="flex items-center gap-5 py-2 text-[12.5px] text-white/40">
        <button onClick={() => setAll(true)} className="hover:text-white">Approve all</button>
        <button onClick={() => setAll(false)} className="hover:text-white">Clear</button>
        <span className="ml-auto font-mono text-[11.5px] tabular">{totals.groups} of {plan.groups.length} senders · {totals.messages.toLocaleString()} messages approved</span>
      </div>
      {plan.groups.length === 0 && <p className="py-8 text-[13.5px] text-white/35">Nothing to clean with these settings.</p>}
      <ul>
        {plan.groups.map((g) => (
          <li key={g.key}>
            <button onClick={() => toggle(g.key)} className={cn("flex w-full items-baseline gap-4 py-2.5 text-left transition-colors", g.approved ? "text-white" : "text-white/55 hover:text-white/80")}>
              <span className={cn("mt-1 h-3 w-3 shrink-0 self-center rounded-[2px] border", g.approved ? "border-white bg-white" : "border-white/25")} />
              <span className="w-14 shrink-0 font-mono text-[12.5px] tabular">{g.messageIds.length}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px]">{g.label.trim() || g.senderAddress}</span>
                <span className="block truncate text-micro text-white/30">{CATEGORY_LABEL[g.category]} · {accountLabel(g.accountId)} · {g.unread} unread · {formatRelativeTime(g.oldestAt)} → {formatRelativeTime(g.newestAt)}</span>
              </span>
              <span className="shrink-0 text-micro text-white/30">{g.reversibility === "recoverable" ? "recoverable" : "non-destructive"}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex items-center gap-3">
        <Button variant="primary" disabled={!totals.messages} onClick={() => setPhase("confirm")}>Review {totals.messages.toLocaleString()} → confirm</Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}

function propose(messages: readonly Message[], op: CleanupOp, olderThanDays: number, senders?: readonly string[]): CleanupPlan {
  const src = senders ? messages.filter((m) => senders.includes(m.senderAddress.toLowerCase())) : messages;
  return proposeCleanup(src, { op, olderThanDays, minGroup: senders ? 1 : 2, categories: senders ? undefined : undefined, ...(senders ? { categories: ["newsletter", "subscription", "promotion", "notification", "social", "other", "receipt", "order", "purchase", "financial", "travel", "personal", "work", "important", "security"] } : {}) });
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: "attention" }) {
  return (
    <div>
      <p className={cn("font-sans text-display-md font-semibold tabular tracking-tight", tone === "attention" ? "text-status-attention" : "text-white")}>{n.toLocaleString()}</p>
      <p className="mt-1 text-[13px] text-white/50">{label}</p>
    </div>
  );
}

function Opt({ on, onClick, children, danger }: { on: boolean; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cn("relative pb-0.5 transition-colors", on ? (danger ? "text-status-critical" : "text-white") : "text-white/45 hover:text-white/80")}>
      {children}
      {on && <span className={cn("absolute inset-x-0 -bottom-px h-px", danger ? "bg-status-critical" : "bg-white")} />}
    </button>
  );
}
