import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { ContextMenu, type ContextMenuItem } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { getProviders } from "@/providers";
import { PROCESS_CLASS_META, friendlyProcess } from "@/core/safety/processMeta";
import { isManageable } from "@/core/safety/processClassifier";
import { useSettingsStore } from "@/state/settingsStore";
import { useProcessPrefsStore, type ProcessPreference } from "@/state/processPrefsStore";
import { useModeStore } from "@/state/modeStore";
import { notify } from "@/state/toastStore";
import type { ProcessClass, ProcessInfo } from "@/core/types";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";

const FILTERS: { id: "all" | ProcessClass | "managed"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "user-application", label: "User apps" },
  { id: "managed", label: "Marked" },
  { id: "unknown", label: "Unknown" },
  { id: "system-critical", label: "Windows" },
  { id: "driver", label: "Drivers" },
  { id: "security", label: "Security" },
];

const PREF_LABEL: Record<ProcessPreference, string> = { close: "Close when Gaming Mode starts", never: "Never touch", normal: "No special handling" };
type SortKey = "cpu" | "mem" | "name" | "class";

/** Short class label for the table (plain English, restrained color). */
const CLASS_TEXT: Record<ProcessClass, string> = {
  "system-critical": "text-white/40", driver: "text-white/40", security: "text-white/40", hardware: "text-white/40", platform: "text-white/40",
  "user-application": "text-white/85", optional: "text-white/60", unknown: "text-status-attention/80",
};

export function ProcessViewer() {
  const { data: procs, loading, error, reload } = useAsync<readonly ProcessInfo[]>(() => getProviders().system.getProcesses(), []);
  const safety = useSettingsStore((s) => s.system.safety);
  const allowMgmt = useSettingsStore((s) => s.system.allowProcessManagement);
  const gameRunning = useModeStore((s) => s.gameRunning);
  const prefs = useProcessPrefsStore((s) => s.prefs);
  const setPref = useProcessPrefsStore((s) => s.setPref);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "cpu", dir: -1 });

  useEffect(() => {
    // Slow refresh during a game session (footprint).
    const id = setInterval(reload, gameRunning ? 15000 : 4000);
    return () => clearInterval(id);
  }, [reload, gameRunning]);

  const rows = useMemo(() => {
    let list = [...(procs ?? [])];
    if (filter === "managed") list = list.filter((p) => (prefs[p.name.toLowerCase()] ?? "normal") !== "normal");
    else if (filter !== "all") list = list.filter((p) => p.classification === filter);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || friendlyProcess(p.name).name.toLowerCase().includes(q) || (p.publisher ?? "").toLowerCase().includes(q));
    }
    const cmp: Record<SortKey, (a: ProcessInfo, b: ProcessInfo) => number> = {
      cpu: (a, b) => a.cpuPercent - b.cpuPercent,
      mem: (a, b) => a.memoryBytes - b.memoryBytes,
      name: (a, b) => friendlyProcess(a.name).name.localeCompare(friendlyProcess(b.name).name),
      class: (a, b) => a.classification.localeCompare(b.classification),
    };
    return list.sort((a, b) => cmp[sort.key](a, b) * sort.dir);
  }, [procs, filter, query, sort, prefs]);

  const canAct = safety === "enabled" && allowMgmt;
  const counts = useMemo(() => {
    const c: Partial<Record<ProcessClass, number>> = {};
    for (const p of procs ?? []) c[p.classification] = (c[p.classification] ?? 0) + 1;
    return c;
  }, [procs]);

  const setSortKey = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "name" || key === "class" ? 1 : -1 }));
  const SortHead = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <button onClick={() => setSortKey(k)} className={cn("flex items-center gap-1 text-micro transition-colors hover:text-white/70", sort.key === k ? "text-white/70" : "text-white/30", className)}>
      {children}{sort.key === k && (sort.dir === 1 ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
    </button>
  );

  const menuFor = (p: ProcessInfo): (ContextMenuItem | "separator")[] => {
    const canMark = isManageable(p.classification);
    return [
      { id: "details", label: expanded === p.pid ? "Hide details" : "Details", onSelect: () => setExpanded(expanded === p.pid ? null : p.pid) },
      "separator",
      ...(["close", "never", "normal"] as ProcessPreference[]).map((opt) => ({ id: opt, label: PREF_LABEL[opt], disabled: !canMark, onSelect: () => { setPref(p.name, opt); notify.neutral(friendlyProcess(p.name).name, PREF_LABEL[opt]); } })),
    ];
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-6">
        <div className="flex flex-wrap gap-x-8 gap-y-1 font-mono text-[12px] tabular text-white/40">
          <span><span className="text-white/85">{procs?.length ?? "—"}</span> processes</span>
          <span><span className="text-white/85">{counts["user-application"] ?? 0}</span> user apps</span>
          <span><span className="text-white/85">{(counts["system-critical"] ?? 0) + (counts.driver ?? 0) + (counts.security ?? 0) + (counts.hardware ?? 0)}</span> protected</span>
          <span><span className={counts.unknown ? "text-status-attention/80" : "text-white/85"}>{counts.unknown ?? 0}</span> unknown</span>
        </div>
        <p className={cn("text-micro", canAct ? "text-status-attention/80" : "text-white/30")}>{canAct ? "management enabled · marked user apps only" : "observe only · nothing is terminated"}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-5 text-[13px]">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)} className={cn("relative pb-1 transition-colors", filter === f.id ? "text-white" : "text-white/35 hover:text-white/70")}>
              {f.label}{filter === f.id && <span className="absolute inset-x-0 -bottom-px h-px bg-white" />}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Search size={13} className="text-white/30" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter" aria-label="Filter processes" className="h-8 w-44 border-b border-white/10 bg-transparent text-sm text-white/85 placeholder:text-white/25 focus:border-white/50 focus:outline-none" />
        </div>
      </div>

      <div>
        <div className="grid grid-cols-[1fr_84px_96px_150px] items-center gap-4 px-2 pb-2">
          <SortHead k="name">Process</SortHead>
          <SortHead k="cpu" className="justify-end">CPU</SortHead>
          <SortHead k="mem" className="justify-end">Memory</SortHead>
          <SortHead k="class">Class</SortHead>
        </div>
        <div className="rule" />
        {error ? (
          <p className="py-10 text-sm text-white/35">Process list unavailable.</p>
        ) : loading && !procs ? (
          <div className="space-y-1 pt-2">{Array.from({ length: 10 }).map((_, i) => <div key={i} className="h-9 animate-pulse rounded-sm bg-white/[0.015]" />)}</div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-sm text-white/35">No processes match.</p>
        ) : (
          rows.map((p) => {
            const meta = PROCESS_CLASS_META[p.classification];
            const friendly = friendlyProcess(p.name);
            const pref = prefs[p.name.toLowerCase()] ?? "normal";
            const isOpen = expanded === p.pid;
            const canMark = isManageable(p.classification);
            return (
              <ContextMenu key={p.pid} items={menuFor(p)}>
                <div className={cn("border-b border-white/[0.04] transition-colors", isOpen && "bg-white/[0.02]")}>
                  <button onClick={() => setExpanded(isOpen ? null : p.pid)} className="grid w-full grid-cols-[1fr_84px_96px_150px] items-center gap-4 px-2 py-[9px] text-left hover:bg-white/[0.02]" aria-expanded={isOpen}>
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={cn("h-1 w-1 shrink-0 rounded-full", pref === "close" ? "bg-white" : pref === "never" ? "bg-status-attention" : "bg-transparent")} />
                      <span className="truncate text-[13.5px] text-white/85">{friendly.name}</span>
                      {friendly.name.toLowerCase() !== p.name.toLowerCase().replace(/\.exe$/, "") && <span className="hidden truncate font-mono text-[11px] text-white/25 md:inline">{p.name}</span>}
                    </div>
                    <span className="text-right font-mono text-[12.5px] tabular text-white/70">{p.cpuPercent.toFixed(1)}</span>
                    <span className="text-right font-mono text-[12.5px] tabular text-white/55">{formatBytes(p.memoryBytes, 0)}</span>
                    <span className={cn("text-[12px]", CLASS_TEXT[p.classification])}>{meta.label}</span>
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                        <div className="grid grid-cols-1 gap-x-16 gap-y-6 px-2 pb-6 pt-2 md:grid-cols-[1fr_300px]">
                          <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-[12.5px]">
                            <dt className="text-white/30">Process</dt><dd className="font-mono text-white/70">{p.name} <span className="text-white/30">· PID {p.pid}</span></dd>
                            <dt className="text-white/30">Publisher</dt><dd className="text-white/60">{p.publisher ?? "Not available"}</dd>
                            <dt className="text-white/30">Path</dt><dd className="truncate font-mono text-white/55" title={p.path ?? ""} data-selectable="true">{p.path ?? "Not available"}</dd>
                            <dt className="text-white/30">Description</dt><dd className="text-white/60">{friendly.description ?? "—"}</dd>
                            <dt className="text-white/30">Class</dt><dd className="text-white/60">{meta.plain} <span className="text-white/35">— {meta.explain}</span></dd>
                          </dl>
                          <div>
                            <p className="label">Gaming Mode</p>
                            {canMark ? (
                              <div className="mt-2 flex flex-col">
                                {(["close", "never", "normal"] as ProcessPreference[]).map((opt) => (
                                  <button key={opt} onClick={() => { setPref(p.name, opt); notify.neutral(friendly.name, PREF_LABEL[opt]); }} className={cn("flex items-center gap-3 py-1.5 text-left text-[13px] transition-colors", pref === opt ? "text-white" : "text-white/40 hover:text-white/75")}>
                                    <span className={cn("h-1 w-1 rounded-full", pref === opt ? "bg-white" : "bg-white/20")} />{PREF_LABEL[opt]}
                                  </button>
                                ))}
                                <p className="mt-2 text-[11px] leading-relaxed text-white/30">Applies only when Gaming Mode starts and system safety is enabled. NEXUS asks the app to close; it never force-kills.</p>
                              </div>
                            ) : (
                              <p className="mt-2 text-[12.5px] text-white/40">Protected class — never managed automatically.</p>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </ContextMenu>
            );
          })
        )}
      </div>
    </div>
  );
}
