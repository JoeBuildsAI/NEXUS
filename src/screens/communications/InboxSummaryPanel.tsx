import { Sparkles } from "lucide-react";
import { Panel } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { getProviders } from "@/providers";
import { useMemo } from "react";

/** "Since your last check" summary. Uses mock heuristic classification. */
export function InboxSummaryPanel() {
  const since = useMemo(() => Date.now() - 3 * 24 * 3600 * 1000, []);
  const { data } = useAsync(() => getProviders().email.getSummary(since), []);

  if (!data) return null;

  const stats = [
    { label: "new messages", value: data.total, tone: "text-white/90" },
    { label: "potentially important", value: data.important, tone: "text-status-attention" },
    { label: "newsletters", value: data.newsletters, tone: "text-accent" },
    { label: "receipts", value: data.receipts, tone: "text-status-nominal" },
    { label: "other", value: data.other, tone: "text-white/60" },
  ];

  return (
    <Panel className="p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide2 text-accent/70">
        <Sparkles size={13} />
        Since your last check
      </div>
      <div className="mt-3 grid grid-cols-5 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <p className={`font-mono text-xl font-semibold ${s.tone}`}>{s.value}</p>
            <p className="mt-0.5 text-[10px] leading-tight text-white/35">{s.label}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-white/25">
        Classification is heuristic and may be imperfect.
      </p>
    </Panel>
  );
}
