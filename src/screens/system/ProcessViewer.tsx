import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Search, Shield, ShieldAlert, ShieldCheck, ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { getProviders } from "@/providers";
import { PROCESS_CLASS_META, friendlyProcess } from "@/core/safety/processMeta";
import { isManageable } from "@/core/safety/processClassifier";
import { useSettingsStore } from "@/state/settingsStore";
import { useProcessPrefsStore, type ProcessPreference } from "@/state/processPrefsStore";
import { notify } from "@/state/toastStore";
import type { ProcessClass, ProcessInfo } from "@/core/types";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";

const FILTERS: { id: "all" | ProcessClass | "managed"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "user-application", label: "Applications" },
  { id: "managed", label: "Marked" },
  { id: "optional", label: "Optional" },
  { id: "unknown", label: "Unknown" },
  { id: "system-critical", label: "Windows" },
  { id: "driver", label: "Drivers" },
  { id: "security", label: "Security" },
];

const PREF_META: Record<ProcessPreference, { label: string; icon: typeof Shield; tone: string }> = {
  suspend: { label: "Suspend in Gaming Mode", icon: ShieldCheck, tone: "text-accent border-accent/40 bg-accent/10" },
  never: { label: "Never touch", icon: ShieldOff, tone: "text-status-attention border-status-attention/40 bg-status-attention/10" },
  normal: { label: "Normal", icon: Shield, tone: "text-white/60 border-white/10" },
};

export function ProcessViewer() {
  const { data: procs, loading, error, reload } = useAsync<readonly ProcessInfo[]>(() => getProviders().system.getProcesses(), []);
  const safety = useSettingsStore((s) => s.system.safety);
  const allowMgmt = useSettingsStore((s) => s.system.allowProcessManagement);
  const prefs = useProcessPrefsStore((s) => s.prefs);
  const setPref = useProcessPrefsStore((s) => s.setPref);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [sort, setSort] = useState<"cpu" | "mem" | "name">("cpu");

  useEffect(() => {
    const id = setInterval(reload, 4000);
    return () => clearInterval(id);
  }, [reload]);

  const rows = useMemo(() => {
    let list = [...(procs ?? [])];
    if (filter === "managed") list = list.filter((p) => (prefs[p.name.toLowerCase()] ?? "normal") !== "normal");
    else if (filter !== "all") list = list.filter((p) => p.classification === filter);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || friendlyProcess(p.name).name.toLowerCase().includes(q) || (p.publisher ?? "").toLowerCase().includes(q));
    }
    return list.sort((a, b) =>
      sort === "cpu" ? b.cpuPercent - a.cpuPercent : sort === "mem" ? b.memoryBytes - a.memoryBytes : a.name.localeCompare(b.name),
    );
  }, [procs, filter, query, sort, prefs]);

  const canAct = safety === "enabled" && allowMgmt;
  const counts = useMemo(() => {
    const c: Partial<Record<ProcessClass, number>> = {};
    for (const p of procs ?? []) c[p.classification] = (c[p.classification] ?? 0) + 1;
    return c;
  }, [procs]);

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] tracking-wide2 text-white/40">
        <span><span className="text-white/80">{procs?.length ?? "—"}</span> PROCESSES</span>
        <span><span className="text-accent">{counts["user-application"] ?? 0}</span> APPLICATIONS</span>
        <span><span className="text-white/70">{(counts["system-critical"] ?? 0) + (counts.driver ?? 0) + (counts.security ?? 0)}</span> PROTECTED</span>
        <span><span className="text-status-attention">{counts.unknown ?? 0}</span> UNKNOWN</span>
        <span className={cn("ml-auto flex items-center gap-1.5", canAct ? "text-status-attention" : "text-white/35")}>
          {canAct ? <ShieldAlert size={12} /> : <Shield size={12} />}
          {canAct ? "MANAGEMENT ENABLED · ALLOWLIST ONLY" : "OBSERVE ONLY · NOTHING IS TERMINATED"}
        </span>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs transition-colors",
                filter === f.id ? "bg-accent/15 text-accent" : "text-white/45 hover:bg-white/[0.04] hover:text-white/80",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-9 rounded-lg border border-white/[0.08] bg-void-800 px-2 text-xs text-white/70 focus:outline-none">
            <option value="cpu">Sort: CPU</option>
            <option value="mem">Sort: Memory</option>
            <option value="name">Sort: Name</option>
          </select>
          <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3">
            <Search size={14} className="text-white/30" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter processes…" className="h-9 w-52 bg-transparent text-sm text-white/85 placeholder:text-white/30 focus:outline-none" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div>
        <div className="grid grid-cols-[1fr_90px_100px_150px_36px] items-center gap-3 px-4 py-2 text-[10px] uppercase tracking-wide2 text-white/30">
          <span>Process</span>
          <span className="text-right">CPU</span>
          <span className="text-right">Memory</span>
          <span>Classification</span>
          <span />
        </div>
        <div className="hairline-t" />
        {error ? (
          <p className="px-4 py-10 text-center text-sm text-white/35">Process list unavailable. {String(error.message)}</p>
        ) : loading && !procs ? (
          <div className="space-y-1 p-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-11 animate-pulse rounded-lg bg-white/[0.02]" />)}</div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-white/35">No processes match.</p>
        ) : (
          rows.map((p) => {
            const meta = PROCESS_CLASS_META[p.classification];
            const friendly = friendlyProcess(p.name);
            const pref = prefs[p.name.toLowerCase()] ?? "normal";
            const isOpen = expanded === p.pid;
            const canMark = isManageable(p.classification);
            const PrefIcon = PREF_META[pref].icon;
            return (
              <div key={p.pid} className={cn("border-b border-white/[0.03] transition-colors", isOpen && "bg-white/[0.02]")}>
                <button
                  onClick={() => setExpanded(isOpen ? null : p.pid)}
                  className="grid w-full grid-cols-[1fr_90px_100px_150px_36px] items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-white/[0.02]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", pref === "suspend" ? "bg-accent" : pref === "never" ? "bg-status-attention" : meta.protected ? "bg-white/20" : "bg-white/40")} />
                    <div className="min-w-0">
                      <p className="truncate text-white/85">
                        {friendly.name}
                        {friendly.name.toLowerCase() !== p.name.toLowerCase().replace(/\.exe$/, "") && <span className="ml-2 font-mono text-[11px] text-white/30">{p.name}</span>}
                      </p>
                      <p className="truncate text-[11px] text-white/30">PID {p.pid}{p.publisher ? ` · ${p.publisher}` : ""}{friendly.description ? ` · ${friendly.description}` : ""}</p>
                    </div>
                  </div>
                  <span className="text-right font-mono tabular-nums text-white/70">{p.cpuPercent.toFixed(1)}%</span>
                  <span className="text-right font-mono tabular-nums text-white/55">{formatBytes(p.memoryBytes, 0)}</span>
                  <span><Badge tone={meta.tone}>{meta.label}</Badge></span>
                  <ChevronDown size={14} className={cn("text-white/30 transition-transform", isOpen && "rotate-180")} />
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className="grid grid-cols-1 gap-6 px-4 pb-5 pt-1 md:grid-cols-[1fr_320px]">
                        <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-xs">
                          <dt className="text-white/30">Executable</dt><dd className="font-mono text-white/70">{p.name}</dd>
                          <dt className="text-white/30">Path</dt><dd className="truncate font-mono text-white/60" title={p.path ?? ""} data-selectable="true">{p.path ?? "Not available"}</dd>
                          <dt className="text-white/30">Publisher</dt><dd className="text-white/60">{p.publisher ?? "Not available"}</dd>
                          <dt className="text-white/30">Description</dt><dd className="text-white/60">{friendly.description ?? "No description available"}</dd>
                          <dt className="text-white/30">Class</dt><dd className="text-white/60">{meta.plain} — <span className="text-white/40">{meta.explain}</span></dd>
                        </dl>

                        <div>
                          <p className="text-[10px] uppercase tracking-wide2 text-white/30">Gaming Mode handling</p>
                          {canMark ? (
                            <div className="mt-2 flex flex-col gap-1.5">
                              {(["suspend", "never", "normal"] as ProcessPreference[]).map((opt) => {
                                const M = PREF_META[opt];
                                const Icon = M.icon;
                                return (
                                  <button
                                    key={opt}
                                    onClick={() => {
                                      setPref(p.name, opt);
                                      notify.neutral(`${friendly.name}: ${M.label}`);
                                    }}
                                    className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors", pref === opt ? M.tone : "border-white/[0.06] text-white/50 hover:border-white/15")}
                                  >
                                    <Icon size={13} /> {M.label}
                                  </button>
                                );
                              })}
                              <p className="mt-1 text-[10px] leading-relaxed text-white/30">
                                Suspension only happens in Gaming Mode, only when system safety is enabled, and is reversed on exit.
                              </p>
                            </div>
                          ) : (
                            <div className="mt-2 flex items-start gap-2 rounded-lg border border-white/[0.06] px-3 py-2.5 text-xs text-white/45">
                              <PrefIcon size={13} className="mt-0.5 shrink-0" />
                              <span>Protected class — NEXUS will never manage this process automatically.</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
