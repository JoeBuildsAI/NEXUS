import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { EmailAccount, Message } from "@/core/types";
import { analyzeInbox, type SenderStat } from "@/core/email/health";
import { CATEGORY_LABEL } from "@/core/email/classify";
import { buildLedger, planUnsubscribe, type UnsubscribeLedgerRow } from "@/core/email/unsubscribe";
import { useEmailRulesStore } from "@/state/emailRulesStore";
import { useRoutingRulesStore } from "@/state/routingRulesStore";
import { getProviders } from "@/providers";
import type { EmailAutoProvider } from "@/providers/email/EmailAutoProvider";
import { activity } from "@/state/activityStore";
import { Button } from "@/components/ui";
import { openExternal } from "@/lib/openExternal";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { CleanupReview } from "./CleanupReview";
import { RuleComposer } from "./RuleComposer";

interface Props {
  messages: readonly Message[];
  accounts: readonly EmailAccount[];
  onChanged: () => void;
}

type SortKey = "volume" | "recent" | "unread" | "frequency";
type Result = { key: string; ok: boolean; detail: string };

/**
 * Subscription / newsletter control surface. Recurring senders with cadence,
 * volume, unread rate, unsubscribe capability and existing rules. Bulk actions
 * produce a review ledger and require confirmation; results are recorded per
 * item with retry.
 */
export function SubscriptionManager({ messages, accounts, onChanged }: Props) {
  const rules = useEmailRulesStore((s) => s.rules);
  const routing = useRoutingRulesStore((s) => s.rules);
  const [sort, setSort] = useState<SortKey>("volume");
  const [onlyLists, setOnlyLists] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<"browse" | "ledger" | "running" | "results" | "cleanup" | "rule">("browse");
  const [results, setResults] = useState<Result[]>([]);
  const [cleanupSenders, setCleanupSenders] = useState<string[] | null>(null);
  const [cleanupOp, setCleanupOp] = useState<"archive" | "trash">("archive");
  const [ruleFor, setRuleFor] = useState<SenderStat | null>(null);
  const [kept, setKept] = useState<Set<string>>(new Set());

  const health = useMemo(() => analyzeInbox(messages, accounts, { ruledSenders: new Set([...rules.map((r) => r.value), ...routing.map((r) => r.condition.from ?? r.condition.domain ?? "")]) }), [messages, accounts, rules, routing]);
  const rows = useMemo(() => {
    const list = health.senders.filter((s) => (onlyLists ? s.isList || s.unsubscribe !== "UNAVAILABLE" : true) && !kept.has(s.key));
    const by: Record<SortKey, (a: SenderStat, b: SenderStat) => number> = { volume: (a, b) => b.total - a.total, recent: (a, b) => b.lastAt - a.lastAt, unread: (a, b) => b.unread / b.total - a.unread / a.total, frequency: (a, b) => (b.perWeek ?? 0) - (a.perWeek ?? 0) };
    return list.sort(by[sort]);
  }, [health, onlyLists, sort, kept]);
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const accountLabel = (id: string) => { const a = accounts.find((x) => x.id === id); return a?.label ?? a?.displayName ?? ""; };

  const toggle = (key: string) => setSelected((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const ledgerRows: UnsubscribeLedgerRow[] = useMemo(() => rows.filter((r) => selected.has(r.key)).map((r) => {
    const last = byId.get(r.lastMessageId);
    return { key: r.key, sender: r.sender, senderAddress: r.senderAddress, accountId: r.accountId, messageCount: r.total, plan: planUnsubscribe({ listUnsubscribe: last?.listUnsubscribe, listUnsubscribePost: last?.listUnsubscribePost, isBulk: r.isList }) };
  }), [rows, selected, byId]);
  const ledger = useMemo(() => buildLedger(ledgerRows), [ledgerRows]);

  const runUnsubscribe = async (only?: string[]) => {
    setPhase("running");
    const email = getProviders().email as EmailAutoProvider;
    const out: Result[] = only ? results.filter((r) => !only.includes(r.key)) : [];
    for (const row of ledgerRows.filter((r) => !only || only.includes(r.key))) {
      const p = email.providerFor?.(row.accountId);
      try {
        if (row.plan.capability === "SUPPORTED_HEADER" && row.plan.url) {
          const r = p ? await p.unsubscribeOneClick(row.plan.url) : { ok: true, detail: "accepted (demo)" };
          out.push({ key: row.key, ok: r.ok, detail: r.ok ? "one-click accepted" : r.detail });
          if (r.ok) useEmailRulesStore.getState().setRule({ kind: "address", value: row.senderAddress, category: "subscription" });
        } else if (row.plan.capability === "RULE_FALLBACK" || row.plan.capability === "MANUAL_LINK_ONLY") {
          // Fallback: mute via a local rule (and provider rule when connected). Manual links stay manual.
          useEmailRulesStore.getState().setRule({ kind: "address", value: row.senderAddress, category: "subscription" });
          if (p) await p.createRule({ from: row.senderAddress }, { fileTo: "subscription", archive: true }, `${row.sender} → Subscriptions`).then((r) => useRoutingRulesStore.getState().add({ accountId: row.accountId, provider: p.providerId, name: `${row.sender} → Subscriptions`, condition: { from: row.senderAddress }, action: { fileTo: "subscription", archive: true }, enabled: true, providerRuleId: r.providerRuleId })).catch(() => undefined);
          out.push({ key: row.key, ok: true, detail: row.plan.capability === "MANUAL_LINK_ONLY" ? "muted by rule · open the sender's page to fully unsubscribe" : "muted by rule" });
        } else {
          out.push({ key: row.key, ok: false, detail: "nothing safe to do" });
        }
      } catch (e) {
        out.push({ key: row.key, ok: false, detail: String((e as Error)?.message ?? e).slice(0, 80) });
      }
    }
    setResults(out);
    setPhase("results");
    const okCount = out.filter((r) => r.ok).length;
    activity.record("email-unsubscribed", `Unsubscribe run: ${okCount} of ${out.length} senders handled`);
    onChanged();
  };

  if (phase === "cleanup" && cleanupSenders) return <CleanupReview messages={messages} accounts={accounts} senders={cleanupSenders} op={cleanupOp} onClose={() => { setPhase("browse"); setCleanupSenders(null); }} onChanged={onChanged} />;
  if (phase === "rule" && ruleFor) {
    const acct = accounts.find((a) => a.id === ruleFor.accountId) ?? accounts[0];
    const last = byId.get(ruleFor.lastMessageId);
    return acct && last ? <RuleComposer message={last} account={acct} messages={messages} onDone={() => { setPhase("browse"); setRuleFor(null); onChanged(); }} /> : null;
  }

  if (phase === "ledger" || phase === "running" || phase === "results") {
    return (
      <div className="max-w-3xl">
        <p className="text-micro tracking-cinematic text-white/35">{phase === "results" ? "Unsubscribe results" : "Review before unsubscribing"}</p>
        <p className="mt-3 font-sans text-display-md font-semibold tabular text-white">{ledgerRows.length} <span className="text-[18px] font-normal text-white/40">selected</span></p>
        <p className="mt-2 flex flex-wrap gap-x-5 font-mono text-[12px] tabular text-white/55">
          <span>{ledger.counts.header} one-click</span><span>{ledger.counts.rule} rule fallback</span><span>{ledger.counts.manual} manual review</span>{ledger.counts.unavailable > 0 && <span>{ledger.counts.unavailable} nothing to do</span>}
        </p>
        <div className="rule mt-5 mb-1" />
        <ul>
          {ledgerRows.map((r) => {
            const res = results.find((x) => x.key === r.key);
            return (
              <li key={r.key} className="flex items-baseline gap-4 py-2.5 text-[13.5px]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-white/85">{r.sender.trim() || r.senderAddress}</span>
                  <span className="block truncate text-micro text-white/30">{r.messageCount} messages · {accountLabel(r.accountId)}</span>
                </span>
                <span className="shrink-0 text-[12px] text-white/45">{PLAN_LABEL[r.plan.capability]}</span>
                {res && <span className={cn("shrink-0 text-[12px]", res.ok ? "text-white/70" : "text-status-attention")}>{res.ok ? "✓" : "✕"} {res.detail}</span>}
                {r.plan.capability === "MANUAL_LINK_ONLY" && r.plan.url && <button onClick={() => void openExternal(r.plan.url!)} className="inline-flex shrink-0 items-center gap-1 text-[12px] text-white/50 hover:text-white">open page <ExternalLink size={10} /></button>}
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-[12.5px] text-white/35">One-click posts the RFC 8058 request to the sender's https endpoint. Rule fallback mutes and archives future mail. Manual links are never opened for you. NEXUS never sends email.</p>
        <div className="mt-6 flex items-center gap-3">
          {phase === "ledger" && <Button variant="primary" onClick={() => void runUnsubscribe()}>Confirm · {ledgerRows.filter((r) => r.plan.capability !== "UNAVAILABLE").length} actions</Button>}
          {phase === "running" && <span className="text-[13px] text-white/50">Working…</span>}
          {phase === "results" && results.some((r) => !r.ok) && <Button variant="outline" onClick={() => void runUnsubscribe(results.filter((r) => !r.ok).map((r) => r.key))}>Retry failed</Button>}
          <Button variant="ghost" onClick={() => { setPhase("browse"); if (phase === "results") { setSelected(new Set()); setResults([]); } }}>{phase === "results" ? "Done" : "Back"}</Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-micro tracking-cinematic text-white/35">Subscription manager</p>
          <p className="mt-2 text-[14px] text-white/50">{rows.length} recurring sender{rows.length === 1 ? "" : "s"} · {health.unsubscribeCandidates.value} you never read</p>
        </div>
        <div className="flex flex-wrap items-center gap-5 text-[12.5px]">
          <span className="flex items-center gap-3"><span className="text-white/35">Sort</span>{(["volume", "recent", "unread", "frequency"] as SortKey[]).map((k) => <Opt key={k} on={sort === k} onClick={() => setSort(k)}>{k}</Opt>)}</span>
          <Opt on={onlyLists} onClick={() => setOnlyLists(!onlyLists)}>lists only</Opt>
        </div>
      </div>
      <div className="rule mt-5 mb-1" />
      <div className="flex flex-wrap items-center gap-5 py-2 text-[12.5px] text-white/40">
        <button onClick={() => setSelected(new Set(rows.map((r) => r.key)))} className="hover:text-white">Select all</button>
        <button onClick={() => setSelected(new Set(health.inactiveLists.map((r) => r.key)))} className="hover:text-white">Select unread lists</button>
        <button onClick={() => setSelected(new Set())} className="hover:text-white">Clear</button>
        <span className="ml-auto flex items-center gap-3">
          <span className="font-mono text-[11.5px] tabular">{selected.size} selected</span>
          <Button size="sm" variant="outline" disabled={!selected.size} onClick={() => setPhase("ledger")}>Unsubscribe…</Button>
          <Button size="sm" variant="ghost" disabled={!selected.size} onClick={() => { setCleanupSenders(rows.filter((r) => selected.has(r.key)).map((r) => r.senderAddress)); setCleanupOp("archive"); setPhase("cleanup"); }}>Archive existing…</Button>
          <Button size="sm" variant="ghost" disabled={!selected.size} onClick={() => { setCleanupSenders(rows.filter((r) => selected.has(r.key)).map((r) => r.senderAddress)); setCleanupOp("trash"); setPhase("cleanup"); }}>Delete existing…</Button>
        </span>
      </div>

      {rows.length === 0 && <p className="py-10 text-[13.5px] text-white/35">No recurring senders among loaded mail.</p>}
      <ul>
        {rows.map((s) => {
          const on = selected.has(s.key);
          return (
            <li key={s.key} className={cn("group flex items-baseline gap-4 py-2.5 transition-colors", on ? "text-white" : "text-white/60")}>
              <button onClick={() => toggle(s.key)} aria-label={on ? "Deselect" : "Select"} className={cn("mt-1 h-3 w-3 shrink-0 self-center rounded-[2px] border", on ? "border-white bg-white" : "border-white/25 group-hover:border-white/50")} />
              <button onClick={() => toggle(s.key)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[13.5px]">{s.sender.trim() || s.senderAddress}</span>
                <span className="block truncate text-micro text-white/30">{s.domain} · {accountLabel(s.accountId)} · {CATEGORY_LABEL[s.dominant]} · {Math.round(s.listConfidence * 100)}% list{s.hasRule ? " · rule exists" : ""}</span>
              </button>
              <span className="hidden w-24 shrink-0 font-mono text-[11.5px] tabular text-white/45 lg:block">{s.perWeek != null ? `${s.perWeek}/wk` : "—"}</span>
              <span className="w-20 shrink-0 font-mono text-[11.5px] tabular text-white/45">{s.total} · {s.recent30} new</span>
              <span className="hidden w-24 shrink-0 font-mono text-[11.5px] tabular text-white/45 xl:block">{formatRelativeTime(s.lastAt)}</span>
              <span className="w-24 shrink-0 whitespace-nowrap text-right font-mono text-[11.5px] tabular text-white/45">{Math.round((s.unread / s.total) * 100)}% unread</span>
              <span className={cn("w-24 shrink-0 text-right text-micro", s.unsubscribe === "SUPPORTED_HEADER" ? "text-white/60" : "text-white/30")}>{PLAN_LABEL[s.unsubscribe]}</span>
              <span className="flex w-28 shrink-0 justify-end gap-3 text-[12px] opacity-0 transition-opacity group-hover:opacity-100">
                <button onClick={() => setKept((k) => new Set(k).add(s.key))} className="text-white/45 hover:text-white">Keep</button>
                <button onClick={() => { setRuleFor(s); setPhase("rule"); }} className="text-white/45 hover:text-white">Rule</button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const PLAN_LABEL: Record<string, string> = { SUPPORTED_HEADER: "one-click", SUPPORTED_NATIVE: "native", MANUAL_LINK_ONLY: "manual link", RULE_FALLBACK: "rule fallback", UNAVAILABLE: "—", UNKNOWN: "unknown" };

function Opt({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn("relative pb-0.5 transition-colors", on ? "text-white" : "text-white/45 hover:text-white/80")}>
      {children}
      {on && <span className="absolute inset-x-0 -bottom-px h-px bg-white" />}
    </button>
  );
}
