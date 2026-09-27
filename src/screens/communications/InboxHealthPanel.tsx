import { useMemo, useState } from "react";
import type { EmailAccount, Message } from "@/core/types";
import { analyzeInbox, type Figure, type InboxHealth } from "@/core/email/health";
import { CATEGORY_LABEL } from "@/core/email/classify";
import { useEmailRulesStore } from "@/state/emailRulesStore";
import { formatBytes } from "@/lib/utils";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { CleanupReview } from "./CleanupReview";

interface Props {
  messages: readonly Message[];
  accounts: readonly EmailAccount[];
  onOpenSubscriptions: () => void;
  onChanged: () => void;
}

/** Telemetry for communication. Every figure is labelled KNOWN / ESTIMATED / UNAVAILABLE. */
export function InboxHealthPanel({ messages, accounts, onOpenSubscriptions, onChanged }: Props) {
  const rules = useEmailRulesStore((s) => s.rules);
  const [analyzedAt, setAnalyzedAt] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const health: InboxHealth | null = useMemo(() => {
    if (analyzedAt == null) return null;
    return analyzeInbox(messages, accounts, { ruledSenders: new Set(rules.map((r) => r.value)) });
  }, [messages, accounts, rules, analyzedAt]);

  if (!health) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
        <p className="text-micro tracking-cinematic text-white/35">Inbox health</p>
        <p className="mt-4 max-w-md text-[14px] leading-relaxed text-white/45">Who dominates your inbox, which lists you never read, and what can be cleaned safely. Analysis runs locally over the mail NEXUS has loaded — nothing is sent anywhere.</p>
        <Button className="mt-8" variant="primary" onClick={() => setAnalyzedAt(Date.now())}>Analyze</Button>
      </div>
    );
  }

  if (reviewing) return <CleanupReview messages={messages} accounts={accounts} onClose={() => setReviewing(false)} onChanged={onChanged} />;

  return (
    <div className="space-y-12">
      {/* Headline figures */}
      <div className="grid grid-cols-2 gap-x-10 gap-y-8 md:grid-cols-3 xl:grid-cols-6">
        <Fig label="Messages" fig={health.messages} />
        <Fig label="Unread" fig={health.unread} />
        <Fig label="Recurring lists" fig={health.lists} />
        <Fig label="Unsubscribe candidates" fig={health.unsubscribeCandidates} />
        <Fig label="Low-value messages" fig={health.lowValue} />
        <Fig label="Mail size" fig={health.size} format={(v) => formatBytes(v)} />
      </div>
      <p className="-mt-8 text-[11.5px] text-white/30">Analyzed {health.loaded.toLocaleString()} loaded messages across {accounts.length || 1} account{accounts.length === 1 ? "" : "s"} · KNOWN = provider-reported or exact · ESTIMATED = from loaded mail · UNAVAILABLE = not exposed by the provider</p>

      <div className="grid gap-12 lg:grid-cols-2">
        {/* Dominant senders */}
        <section>
          <p className="label">Who fills your inbox</p>
          <div className="rule mt-3 mb-1" />
          <ul>
            {health.topSenders.map((s) => (
              <li key={s.key} className="flex items-baseline gap-4 py-2">
                <span className="w-16 shrink-0 font-mono text-[12.5px] tabular text-white/80">{s.total}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] text-white/80">{s.sender.trim() || s.senderAddress}</span>
                  <span className="block truncate text-micro text-white/30">{CATEGORY_LABEL[s.dominant]}{s.isList ? " · list" : ""}{s.perWeek ? ` · ${s.perWeek}/wk` : ""}{s.hasRule ? " · rule" : ""}{accounts.length > 1 ? ` · ${accounts.find((a) => a.id === s.accountId)?.label ?? accounts.find((a) => a.id === s.accountId)?.displayName ?? ""}` : ""}</span>
                </span>
                <span className="w-24 shrink-0 whitespace-nowrap text-right font-mono text-[11px] tabular text-white/35">{s.total ? Math.round((s.unread / s.total) * 100) : 0}% unread</span>
                <span className="h-px w-24 shrink-0 self-center bg-white/10"><span className="block h-px bg-white/70" style={{ width: `${Math.min(100, (s.total / (health.topSenders[0]?.total || 1)) * 100)}%` }} /></span>
              </li>
            ))}
          </ul>
        </section>

        {/* Inactive lists + trends */}
        <section className="space-y-12">
          <div>
            <div className="flex items-baseline justify-between">
              <p className="label">Lists you don't read</p>
              <button onClick={onOpenSubscriptions} className="text-[12.5px] text-white/45 hover:text-white">Subscription manager →</button>
            </div>
            <div className="rule mt-3 mb-1" />
            {health.inactiveLists.length === 0 && <p className="py-3 text-[13px] text-white/35">Every recurring list has been read recently.</p>}
            <ul>
              {health.inactiveLists.slice(0, 8).map((s) => (
                <li key={s.key} className="flex items-baseline gap-4 py-2">
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-white/80">{s.sender.trim() || s.senderAddress}</span>
                  <span className="shrink-0 font-mono text-[11px] tabular text-white/40">{s.unread}/{s.total} unread</span>
                  <span className={cn("shrink-0 text-micro", s.unsubscribe === "SUPPORTED_HEADER" ? "text-white/60" : "text-white/30")}>{UNSUB_LABEL[s.unsubscribe]}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="label">This week vs last</p>
            <div className="rule mt-3 mb-1" />
            <ul className="grid grid-cols-2 gap-x-8">
              {health.trends.map((t) => (
                <li key={t.category} className="flex items-baseline justify-between py-1.5 text-[13px]">
                  <span className="text-white/60">{CATEGORY_LABEL[t.category]}</span>
                  <span className="font-mono text-[12px] tabular text-white/70">{t.thisWeek}<span className="text-white/30"> / {t.lastWeek}</span>{t.thisWeek > t.lastWeek * 1.5 && t.thisWeek >= 3 && <span className="ml-2 text-status-attention/80">↑</span>}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {/* Cleanup entry: analysis never executes anything */}
      <div className="flex flex-wrap items-center gap-6 border-t border-white/[0.08] pt-6">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] text-white/85">{health.lowValue.value?.toLocaleString() ?? 0} low-value messages older than 30 days</p>
          <p className="mt-1 text-[13px] text-white/40">Newsletters, promotions, notifications and social mail. Review groups by sender, approve what goes, then execute — archive first, delete only when you say so.</p>
        </div>
        <Button variant="outline" onClick={() => setReviewing(true)} disabled={!health.lowValue.value}>Review cleanup</Button>
        <Button variant="ghost" onClick={() => setAnalyzedAt(Date.now())}>Re-analyze</Button>
      </div>
    </div>
  );
}

const UNSUB_LABEL: Record<string, string> = { SUPPORTED_HEADER: "one-click", SUPPORTED_NATIVE: "native", MANUAL_LINK_ONLY: "manual link", RULE_FALLBACK: "rule fallback", UNAVAILABLE: "—", UNKNOWN: "unknown" };

function Fig({ label, fig, format }: { label: string; fig: Figure; format?: (v: number) => string }) {
  return (
    <div>
      <p className="font-sans text-display-md font-semibold tabular tracking-tight text-white">{fig.value == null ? "—" : format ? format(fig.value) : fig.value.toLocaleString()}</p>
      <p className="mt-1 text-[13px] text-white/60">{label}</p>
      <p className={cn("mt-1 text-micro", fig.confidence === "KNOWN" ? "text-white/40" : fig.confidence === "ESTIMATED" ? "text-status-attention/70" : "text-white/25")} title={fig.note}>{fig.confidence}</p>
    </div>
  );
}
