import { useEffect, useMemo, useState } from "react";
import type { Message } from "@/core/types";
import { summarize } from "@/core/email/classify";
import { getProviders } from "@/providers";
import type { IntelligenceStatus, Narrative } from "@/providers/intelligence/InboxIntelligenceProvider";
import { useNavigationStore } from "@/state/navigationStore";
import { cn } from "@/lib/utils";

interface Props {
  messages: readonly Message[];
  onSelectView: (view: "important" | "people" | "receipts" | "newsletters" | "promotions" | "notifications" | "financial" | "travel" | "purchases") => void;
}

/**
 * Daily summary. Deterministic counts always; an optional AI narrative slot
 * that is clearly labelled and stays empty until a provider is configured.
 */
export function SummaryPanel({ messages, onSelectView }: Props) {
  const startOfDay = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }, []);
  const today = useMemo(() => summarize(messages, startOfDay), [messages, startOfDay]);
  const week = useMemo(() => summarize(messages, Date.now() - 7 * 86400_000), [messages]);
  const [ai, setAi] = useState<IntelligenceStatus | null>(null);
  const [narrative, setNarrative] = useState<Narrative | null>(null);
  const navigate = useNavigationStore((s) => s.navigate);
  const setSection = useNavigationStore((s) => s.setSettingsSection);

  useEffect(() => {
    let cancelled = false;
    const intel = getProviders().intelligence;
    void intel.status().then((s) => { if (!cancelled) setAi(s); });
    void intel.summarizeDay(messages.filter((m) => m.timestamp >= startOfDay)).then((n) => { if (!cancelled) setNarrative(n); });
    return () => { cancelled = true; };
  }, [messages, startOfDay]);

  const rows: { label: string; n: number; view: Parameters<Props["onSelectView"]>[0] | null }[] = [
    { label: "priority", n: today.important, view: "important" },
    { label: "from people", n: today.people, view: "people" },
    { label: "purchases & orders", n: today.purchases, view: "purchases" },
    { label: "receipts", n: today.receipts, view: "receipts" },
    { label: "financial", n: today.financial, view: "financial" },
    { label: "travel", n: today.travel, view: "travel" },
    { label: "newsletters", n: today.newsletters, view: "newsletters" },
    { label: "promotions", n: today.promotions, view: "promotions" },
    { label: "notifications", n: today.notifications, view: "notifications" },
    { label: "security", n: today.security, view: null },
    { label: "other", n: today.other, view: null },
  ];

  return (
    <div className="grid gap-14 lg:grid-cols-[minmax(320px,0.8fr)_1.2fr]">
      <section>
        <p className="text-micro tracking-cinematic text-white/35">Today</p>
        <p className="mt-3 font-sans text-display-xl font-semibold tabular tracking-tight text-white">{today.total}<span className="ml-3 text-[18px] font-normal text-white/40">new · {today.unread} unread</span></p>
        <ul className="mt-8">
          {rows.filter((r) => r.n > 0).map((r) => (
            <li key={r.label}>
              <button disabled={!r.view} onClick={() => r.view && onSelectView(r.view)} className={cn("flex w-full items-baseline gap-4 py-1.5 text-left", r.view ? "hover:text-white" : "")}>
                <span className="w-10 font-mono text-[14px] tabular text-white/85">{r.n}</span>
                <span className="text-[14px] text-white/60">{r.label}</span>
              </button>
            </li>
          ))}
          {today.total === 0 && <li className="py-2 text-[13.5px] text-white/35">Nothing new today.</li>}
        </ul>
        <p className="mt-8 text-micro text-white/30">This week · {week.total} messages · {week.important} priority · {week.receipts} receipts · {week.newsletters + week.promotions} bulk</p>
        <p className="mt-2 text-[11.5px] text-white/25">Deterministic counts from the local classifier.</p>
      </section>

      <section className="border-l border-white/[0.08] pl-10">
        <p className="flex items-center gap-3 text-micro tracking-cinematic text-white/35">What actually mattered today? <span className="rounded-sm border border-white/15 px-1.5 py-0.5 text-[9.5px] normal-case tracking-normal text-white/40">{narrative?.source === "ai" ? "AI-generated" : "AI · not configured"}</span></p>
        {narrative ? (
          <p className="mt-5 max-w-xl text-[15px] leading-[1.7] text-white/75">{narrative.text}</p>
        ) : (
          <div className="mt-5 max-w-xl text-[14px] leading-relaxed text-white/45">
            <p>No intelligence provider is configured, so there is no narrative — and nothing about your mail has left this machine.</p>
            <p className="mt-3">{ai?.dataPolicy}</p>
            <p className="mt-4">
              <button onClick={() => { navigate("settings"); setSection("ai"); }} className="text-white/65 hover:text-white">Configure in Settings → AI</button>
              <span className="text-white/30"> · the local classifier, Inbox Health and cleanup work fully without it.</span>
            </p>
          </div>
        )}
        <div className="mt-10">
          <p className="text-micro text-white/30">Highest-signal today</p>
          <ul className="mt-3 space-y-1.5">
            {messages.filter((m) => m.timestamp >= startOfDay && (m.category === "important" || m.category === "security" || m.category === "financial")).slice(0, 6).map((m) => (
              <li key={m.id} className="flex items-baseline gap-3 text-[13.5px]"><span className="w-24 shrink-0 truncate text-white/45">{m.sender.trim() || m.senderAddress}</span><span className="truncate text-white/75">{m.subject}</span></li>
            ))}
            {messages.filter((m) => m.timestamp >= startOfDay && (m.category === "important" || m.category === "security" || m.category === "financial")).length === 0 && <li className="text-[13px] text-white/30">Nothing urgent surfaced today.</li>}
          </ul>
        </div>
      </section>
    </div>
  );
}
