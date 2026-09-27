import { useMemo, useState } from "react";
import { Cpu, Search, Shield, ShieldAlert } from "lucide-react";
import { Panel, Badge, Button } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { getProviders } from "@/providers";
import { PROCESS_CLASS_META } from "@/core/safety/processMeta";
import { isManageable } from "@/core/safety/processClassifier";
import { useSettingsStore } from "@/state/settingsStore";
import { requestConfirm } from "@/state/confirmStore";
import type { ProcessClass, ProcessInfo } from "@/core/types";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";

const FILTERS: { id: "all" | ProcessClass; label: string }[] = [
  { id: "all", label: "All" },
  { id: "user-application", label: "Applications" },
  { id: "optional", label: "Optional" },
  { id: "unknown", label: "Unknown" },
  { id: "system-critical", label: "System" },
];

export function ProcessViewer() {
  const { data: procs, loading, reload } = useAsync<readonly ProcessInfo[]>(
    () => getProviders().system.getProcesses(),
    [],
  );
  const safety = useSettingsStore((s) => s.system.safety);
  const allowMgmt = useSettingsStore((s) => s.system.allowProcessManagement);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | ProcessClass>("all");

  const rows = useMemo(() => {
    let list = [...(procs ?? [])];
    if (filter !== "all") list = list.filter((p) => p.classification === filter);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.publisher ?? "").toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => b.cpuPercent - a.cpuPercent);
  }, [procs, filter, query]);

  const canAct = safety === "enabled" && allowMgmt;

  const handleSuspend = (p: ProcessInfo) => {
    // SAFETY: only allowlisted, manageable processes are ever actionable.
    if (!p.managed || !isManageable(p.classification)) return;
    requestConfirm({
      title: `Suspend ${p.name}?`,
      message: `NEXUS will suspend the allowlisted process "${p.name}" (PID ${p.pid}). You can resume it at any time. This only affects apps on your explicit allowlist.`,
      confirmLabel: "Suspend",
      danger: true,
      onConfirm: () => reload(),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs transition-colors",
                filter === f.id
                  ? "border-accent/30 bg-accent/10 text-accent"
                  : "border-white/[0.06] text-white/50 hover:text-white/80",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3">
          <Search size={14} className="text-white/30" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter processes…"
            className="h-9 w-52 bg-transparent text-sm text-white/85 placeholder:text-white/30 focus:outline-none"
          />
        </div>
      </div>

      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
          canAct
            ? "border-status-attention/25 bg-status-attention/[0.06] text-status-attention"
            : "border-white/[0.06] bg-white/[0.02] text-white/45",
        )}
      >
        {canAct ? <ShieldAlert size={14} /> : <Shield size={14} />}
        {canAct
          ? "Process management enabled. Only allowlisted applications can be suspended."
          : "Observe-only mode. NEXUS will not terminate or suspend any process. Enable in Settings → System."}
      </div>

      <Panel className="overflow-hidden">
        <div className="grid grid-cols-[1fr_90px_90px_130px_80px] items-center gap-3 border-b border-white/[0.06] px-4 py-2.5 text-[10px] uppercase tracking-wide2 text-white/35">
          <span>Process</span>
          <span className="text-right">CPU</span>
          <span className="text-right">Memory</span>
          <span>Classification</span>
          <span className="text-right">Action</span>
        </div>
        <div className="max-h-[calc(100vh-360px)] overflow-y-auto">
          {loading ? (
            <p className="px-4 py-8 text-center text-sm text-white/30">Loading processes…</p>
          ) : (
            rows.map((p) => {
              const meta = PROCESS_CLASS_META[p.classification];
              const actionable = canAct && p.managed && !meta.protected;
              return (
                <div
                  key={p.pid}
                  className="grid grid-cols-[1fr_90px_90px_130px_80px] items-center gap-3 border-b border-white/[0.03] px-4 py-2.5 text-sm hover:bg-white/[0.02]"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Cpu size={14} className="shrink-0 text-white/25" />
                    <div className="min-w-0">
                      <p className="truncate text-white/85">{p.name}</p>
                      <p className="truncate text-[11px] text-white/30">
                        PID {p.pid}
                        {p.publisher && ` · ${p.publisher}`}
                      </p>
                    </div>
                  </div>
                  <span className="text-right font-mono text-white/70">
                    {p.cpuPercent.toFixed(1)}%
                  </span>
                  <span className="text-right font-mono text-white/60">
                    {formatBytes(p.memoryBytes, 0)}
                  </span>
                  <span>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </span>
                  <div className="text-right">
                    {actionable ? (
                      <Button size="sm" variant="outline" onClick={() => handleSuspend(p)}>
                        Suspend
                      </Button>
                    ) : (
                      <span
                        className="text-[11px] text-white/25"
                        title={
                          meta.protected
                            ? "Protected — never auto-managed"
                            : "Not on allowlist"
                        }
                      >
                        {meta.protected ? "Protected" : "—"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Panel>
    </div>
  );
}
