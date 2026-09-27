import { useMemo } from "react";
import { useAsync } from "@/hooks/useAsync";
import { getProviders } from "@/providers";
import { notify } from "@/state/toastStore";
import type { Subscription } from "@/core/types";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

/** Newsletters & subscriptions. Frequency, last opened, one quiet action. */
export function SubscriptionsPanel() {
  const provider = useMemo(() => getProviders().email, []);
  const { data, reload } = useAsync<readonly Subscription[]>(() => provider.getSubscriptions(), []);
  const subs = useMemo(() => data ?? [], [data]);
  const sorted = useMemo(() => [...subs].sort((a, b) => (a.status === b.status ? b.frequencyPerWeek - a.frequencyPerWeek : a.status === "active" ? -1 : 1)), [subs]);
  const active = subs.filter((s) => s.status === "active");
  const weekly = active.reduce((n, s) => n + s.frequencyPerWeek, 0);
  const stale = active.filter((s) => !s.lastOpened || Date.now() - s.lastOpened > 60 * 24 * 3600 * 1000);

  const unsubscribe = async (s: Subscription) => {
    await provider.unsubscribeSender(s.id);
    notify.success(`Unsubscribed · ${s.sender}`, `About ${s.frequencyPerWeek} fewer emails per week.`);
    reload();
  };

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap gap-16">
        <Metric n={active.length} label="active" />
        <Metric n={weekly} label="emails per week" />
        <Metric n={stale.length} label="not opened in 60 days" dim={stale.length === 0} />
      </div>
      {stale.length > 0 && (
        <p className="mt-6 max-w-xl text-[14px] leading-relaxed text-white/45">
          <span className="text-white/80">{stale.length} sender{stale.length === 1 ? "" : "s"}</span> you haven't opened in two months send <span className="text-white/80">{stale.reduce((n, s) => n + s.frequencyPerWeek, 0)} emails a week</span>.
        </p>
      )}

      <div className="mt-10 divide-y divide-white/[0.05]">
        {sorted.map((s) => {
          const isStale = stale.includes(s);
          const gone = s.status === "unsubscribed";
          return (
            <div key={s.id} className={cn("grid grid-cols-[1fr_120px_140px_120px] items-baseline gap-6 py-4", gone && "opacity-40")}>
              <div className="min-w-0">
                <p className="flex items-baseline gap-3 text-[15px] text-white/85">{s.sender}{isStale && !gone && <span className="text-micro text-status-attention/80">stale</span>}</p>
                <p className="mt-0.5 truncate text-[12px] text-white/35">{s.category} · <span data-selectable="true">{s.senderAddress}</span></p>
              </div>
              <p className="font-mono text-[12.5px] tabular text-white/55">{s.frequencyPerWeek} <span className="text-white/30">/ wk</span></p>
              <p className="text-[12.5px] text-white/45">{s.lastOpened ? formatRelativeTime(s.lastOpened) : "Never opened"}</p>
              {gone ? <span className="text-right text-micro text-white/40">unsubscribed</span> : <button onClick={() => void unsubscribe(s)} className="text-right text-[12.5px] text-white/45 transition-colors hover:text-white">Unsubscribe</button>}
            </div>
          );
        })}
      </div>
      <p className="mt-6 text-[11px] text-white/25">Mock provider — actions update local state. Real providers will issue list-unsubscribe requests.</p>
    </div>
  );
}

function Metric({ n, label, dim }: { n: number; label: string; dim?: boolean }) {
  return (
    <div>
      <p className={cn("font-display text-display-lg font-semibold tabular", dim ? "text-white/40" : "text-white")}>{n}</p>
      <p className="label mt-2">{label}</p>
    </div>
  );
}
