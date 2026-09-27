import { useMemo } from "react";
import { useAsync } from "@/hooks/useAsync";
import { getProviders } from "@/providers";

/** "Since your last check" — a short typographic ledger. */
export function InboxSummaryPanel() {
  const since = useMemo(() => Date.now() - 3 * 24 * 3600 * 1000, []);
  const { data } = useAsync(() => getProviders().email.getSummary(since), []);
  if (!data) return null;

  const lines = [
    { n: data.total, label: "new messages", strong: true },
    { n: data.important, label: "require attention" },
    { n: data.newsletters, label: "newsletters" },
    { n: data.receipts, label: "receipts" },
  ].filter((l) => l.n > 0 || l.strong);

  return (
    <div>
      <p className="label">Since your last check</p>
      <div className="mt-4 space-y-1.5">
        {lines.map((l) => (
          <p key={l.label} className="flex items-baseline gap-3">
            <span className={`w-8 font-mono text-[15px] tabular ${l.strong ? "text-white" : "text-white/70"}`}>{l.n}</span>
            <span className={`text-[14px] ${l.strong ? "text-white/80" : "text-white/45"}`}>{l.label}</span>
          </p>
        ))}
      </div>
      <p className="mt-4 text-[11px] text-white/25">Classification is heuristic.</p>
    </div>
  );
}
