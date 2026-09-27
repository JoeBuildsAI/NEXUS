import { useMemo } from "react";
import { BellOff, Check, Mail } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { getProviders } from "@/providers";
import { notify } from "@/state/toastStore";
import type { Subscription } from "@/core/types";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

/** Newsletters & subscriptions manager (mock provider; actions update local state). */
export function SubscriptionsPanel() {
  const provider = useMemo(() => getProviders().email, []);
  const { data, reload } = useAsync<readonly Subscription[]>(() => provider.getSubscriptions(), []);
  const subs = useMemo(() => data ?? [], [data]);

  const sorted = useMemo(
    () => [...subs].sort((a, b) => (a.status === b.status ? b.frequencyPerWeek - a.frequencyPerWeek : a.status === "active" ? -1 : 1)),
    [subs],
  );
  const active = subs.filter((s) => s.status === "active");
  const weekly = active.reduce((n, s) => n + s.frequencyPerWeek, 0);
  const stale = active.filter((s) => !s.lastOpened || Date.now() - s.lastOpened > 60 * 24 * 3600 * 1000);

  const unsubscribe = async (s: Subscription) => {
    await provider.unsubscribeSender(s.id);
    notify.success(`Unsubscribed from ${s.sender}`, `About ${s.frequencyPerWeek} fewer emails per week.`);
    reload();
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end gap-10">
        <Metric n={active.length} label="active subscriptions" />
        <Metric n={weekly} label="emails / week" />
        <Metric n={stale.length} label="not opened in 60+ days" tone={stale.length ? "attention" : "neutral"} />
      </div>

      {stale.length > 0 && (
        <p className="text-sm text-white/50">
          <span className="text-white/80">{stale.length} sender{stale.length === 1 ? "" : "s"}</span> you haven’t opened in over two months account for{" "}
          <span className="text-white/80">{stale.reduce((n, s) => n + s.frequencyPerWeek, 0)} emails a week</span>. Candidates to unsubscribe.
        </p>
      )}

      <div className="divide-y divide-white/[0.04]">
        {sorted.map((s) => {
          const isStale = stale.includes(s);
          const gone = s.status === "unsubscribed";
          return (
            <div key={s.id} className={cn("flex items-center gap-4 py-3.5", gone && "opacity-45")}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-white/40"><Mail size={15} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-white/85">{s.sender}</p>
                  <Badge tone="neutral" className="capitalize">{s.category}</Badge>
                  {isStale && !gone && <Badge tone="attention">Stale</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-white/40" data-selectable="true">{s.senderAddress}</p>
              </div>
              <div className="hidden w-32 text-right text-xs text-white/50 sm:block">
                <p className="font-mono text-white/75">{s.frequencyPerWeek}</p>
                <p className="text-white/30">emails / week</p>
              </div>
              <div className="hidden w-32 text-right text-xs text-white/50 md:block">
                <p className="text-white/70">{s.lastOpened ? formatRelativeTime(s.lastOpened) : "Never"}</p>
                <p className="text-white/30">last opened</p>
              </div>
              {gone ? (
                <span className="flex w-32 items-center justify-end gap-1.5 text-xs text-status-nominal"><Check size={13} /> Unsubscribed</span>
              ) : (
                <Button size="sm" variant="outline" className="w-32" onClick={() => void unsubscribe(s)}><BellOff size={13} /> Unsubscribe</Button>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-white/25">Mock provider — unsubscribe updates local state. Real providers will issue list-unsubscribe requests.</p>
    </div>
  );
}

function Metric({ n, label, tone = "neutral" }: { n: number; label: string; tone?: "neutral" | "attention" }) {
  return (
    <div>
      <p className={cn("font-display text-4xl font-semibold leading-none", tone === "attention" ? "text-status-attention" : "text-white/95")}>{n}</p>
      <p className="mt-1.5 text-[11px] uppercase tracking-wide2 text-white/35">{label}</p>
    </div>
  );
}
