import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Check, HardDrive, Lock, Search, Trash2 } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { useTelemetryStore } from "@/state/telemetryStore";
import { DEMO_DRIVES } from "@/core/demo/system";
import { demoStorageAnalysis, DEMO_CLEANUP_CANDIDATES } from "@/core/demo/storage";
import { buildPlan, eligibleDrivesForScan, validateExecution } from "@/core/storage/storageService";
import type { AnalysisConfidence, CleanupCandidate, StorageCategory } from "@/core/types";
import { requestConfirm } from "@/state/confirmStore";
import { notify } from "@/state/toastStore";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";

const CATEGORY_COLORS: Record<StorageCategory, string> = {
  games: "#e6a15e", media: "#5ed0e6", applications: "#9f8cff", system: "#8892a0",
  documents: "#5ee6a1", downloads: "#e6cf5e", temporary: "#e65e6f", other: "#3a4250",
};
const CATEGORY_LABELS: Record<StorageCategory, string> = {
  games: "Games", media: "Media", applications: "Applications", system: "Windows / System",
  documents: "Documents", downloads: "Downloads", temporary: "Temporary", other: "Not analyzed",
};
const CONF: Record<AnalysisConfidence, { label: string; tone: "nominal" | "attention" | "neutral" }> = {
  known: { label: "KNOWN", tone: "nominal" },
  estimated: { label: "ESTIMATED", tone: "attention" },
  "not-analyzed": { label: "NOT ANALYZED", tone: "neutral" },
};

export function StorageAnalyzer() {
  const liveDrives = useTelemetryStore((s) => s.snapshot?.storage);
  const drives = liveDrives && liveDrives.length ? liveDrives : DEMO_DRIVES;
  const eligible = useMemo(() => eligibleDrivesForScan(drives), [drives]);
  const excluded = drives.filter((d) => d.kind !== "fixed");
  const [selected, setSelected] = useState<string | null>(null);
  const drive = eligible.find((d) => d.mountPoint === selected) ?? eligible[0];
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState<Record<string, boolean>>({});
  const [candidates, setCandidates] = useState<CleanupCandidate[]>(() => DEMO_CLEANUP_CANDIDATES.map((c) => ({ ...c })));

  useEffect(() => {
    if (!selected && eligible[0]) setSelected(eligible[0].mountPoint);
  }, [eligible, selected]);

  const analysis = useMemo(() => (drive ? demoStorageAnalysis(drive.mountPoint, drive.totalBytes, drive.freeBytes) : null), [drive]);
  const plan = buildPlan(candidates);
  const isAnalyzed = drive ? analyzed[drive.mountPoint] : false;

  const runAnalysis = () => {
    if (!drive) return;
    setAnalyzing(true);
    setTimeout(() => {
      setAnalyzing(false);
      setAnalyzed((a) => ({ ...a, [drive.mountPoint]: true }));
      notify.success("Storage analysis complete", `${drive.mountPoint} — bounded scan of known locations only.`);
    }, 1400);
  };

  const toggle = (id: string) => setCandidates((cs) => cs.map((c) => (c.id === id ? { ...c, approved: !c.approved } : c)));

  const execute = () => {
    if (validateExecution(plan).length) return;
    const approved = candidates.filter((c) => c.approved);
    const destructive = approved.filter((c) => c.risk === "destructive");
    requestConfirm({
      title: destructive.length ? "Execute cleanup including your own files?" : "Execute cleanup?",
      message: `Reclaim ${formatBytes(plan.reclaimableBytes)} across ${approved.length} item${approved.length === 1 ? "" : "s"}.${destructive.length ? ` ${destructive.length} item${destructive.length === 1 ? "" : "s"} contain user content and cannot be undone.` : ""} Removable drives are never touched.`,
      confirmLabel: "Execute",
      danger: true,
      onConfirm: () => {
        setCandidates((cs) => cs.filter((c) => !c.approved));
        notify.success(`Reclaimed ${formatBytes(plan.reclaimableBytes)}`, "Approved cleanup executed.");
      },
    });
  };

  if (!drive || !analysis) {
    return <p className="text-sm text-white/40">No eligible fixed drives detected.</p>;
  }

  const usedPct = (analysis.usedBytes / analysis.totalBytes) * 100;

  return (
    <div className="space-y-10">
      {/* Drive selector */}
      <div className="flex flex-wrap items-center gap-2">
        {eligible.map((d) => {
          const pct = d.totalBytes ? ((d.totalBytes - d.freeBytes) / d.totalBytes) * 100 : 0;
          return (
            <button
              key={d.mountPoint}
              onClick={() => setSelected(d.mountPoint)}
              className={cn("group flex min-w-[200px] items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors", drive.mountPoint === d.mountPoint ? "border-accent/40 bg-accent/[0.07]" : "border-white/[0.06] hover:border-white/15")}
            >
              <HardDrive size={16} className={drive.mountPoint === d.mountPoint ? "text-accent" : "text-white/35"} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white/85">{d.mountPoint} <span className="text-white/40">{d.label}</span></p>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className={cn("h-full rounded-full", pct > 88 ? "bg-status-warning" : "bg-accent/70")} style={{ width: `${pct}%` }} />
                </div>
              </div>
              <span className="font-mono text-xs text-white/40">{Math.round(pct)}%</span>
            </button>
          );
        })}
        {excluded.map((d) => (
          <div key={d.mountPoint} title="Removable/network drives are never scanned automatically." className="flex items-center gap-2 rounded-xl border border-dashed border-white/[0.08] px-4 py-3 text-sm text-white/30">
            <Lock size={13} /> {d.mountPoint} {d.label} <span className="text-[10px] uppercase tracking-wide2">excluded</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-12 xl:grid-cols-[1.1fr_1fr]">
        {/* Breakdown */}
        <div>
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="text-[10px] uppercase tracking-cinematic text-white/30">{drive.mountPoint} {drive.label}</p>
              <p className="mt-1 font-display text-4xl font-semibold tracking-wide text-white/95">
                {formatBytes(analysis.usedBytes, 1)} <span className="text-lg text-white/35">/ {formatBytes(analysis.totalBytes, 0)}</span>
              </p>
              <p className="mt-1 text-sm text-white/40">{formatBytes(analysis.freeBytes, 0)} free · {Math.round(usedPct)}% used{drive.fileSystem ? ` · ${drive.fileSystem}` : ""}</p>
            </div>
            <Button variant={isAnalyzed ? "outline" : "primary"} onClick={runAnalysis} disabled={analyzing}>
              <Search size={15} className={analyzing ? "animate-pulse" : ""} /> {analyzing ? "Analyzing…" : isAnalyzed ? "Re-analyze" : "Analyze"}
            </Button>
          </div>

          {/* Segmented bar */}
          <div className="mt-6 flex h-4 overflow-hidden rounded-full bg-white/[0.04]">
            {analysis.categories.map((c, i) => (
              <motion.div
                key={c.category}
                initial={{ width: 0 }}
                animate={{ width: `${(c.bytes / analysis.totalBytes) * 100}%` }}
                transition={{ duration: 0.8, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
                title={`${CATEGORY_LABELS[c.category]}: ${formatBytes(c.bytes)}`}
                style={{ background: CATEGORY_COLORS[c.category], opacity: c.confidence === "not-analyzed" ? 0.5 : 1 }}
                className={cn(c.confidence === "estimated" && "bg-[repeating-linear-gradient(45deg,transparent_0_4px,rgba(0,0,0,0.25)_4px_8px)]")}
              />
            ))}
          </div>

          {!isAnalyzed && (
            <p className="mt-3 text-xs text-white/35">Figures shown are from known locations and light estimates. Run Analyze for a bounded scan — NEXUS never recursively scans whole drives.</p>
          )}

          <div className="mt-5 divide-y divide-white/[0.04]">
            {analysis.categories.map((c) => (
              <div key={c.category} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CATEGORY_COLORS[c.category] }} />
                <span className="flex-1 text-white/75">{CATEGORY_LABELS[c.category]}</span>
                <Badge tone={CONF[c.confidence].tone} className="text-[9px]">{CONF[c.confidence].label}</Badge>
                <span className="w-20 text-right text-xs text-white/30">{c.itemCount ? `${c.itemCount.toLocaleString()} items` : ""}</span>
                <span className="w-20 text-right font-mono text-white/70">{formatBytes(c.bytes)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Cleanup */}
        <div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-cinematic text-white/30">Safe cleanup</p>
              <p className="mt-1 text-sm text-white/45">Discovered → proposed. Nothing is removed until you approve and execute.</p>
            </div>
            <span className="font-mono text-sm text-accent">{formatBytes(plan.reclaimableBytes)} <span className="text-white/30">selected</span></span>
          </div>

          <div className="mt-4 space-y-2">
            {candidates.length === 0 && <p className="py-8 text-center text-sm text-white/35">No cleanup candidates remaining.</p>}
            {candidates.map((c) => (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                className={cn("flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors", c.approved ? "border-accent/30 bg-accent/[0.06]" : "border-white/[0.06] hover:bg-white/[0.02]")}
              >
                <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border", c.approved ? "border-accent bg-accent text-void-950" : "border-white/15")}>
                  {c.approved && <Check size={13} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm text-white/85">{c.label}</p>
                    {c.risk === "safe" && <Badge tone="nominal">SAFE</Badge>}
                    {c.risk === "review" && <Badge tone="attention">REVIEW</Badge>}
                    {c.risk === "destructive" && <Badge tone="critical"><AlertTriangle size={10} /> USER FILES</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-white/40">{c.description}</p>
                </div>
                <span className="shrink-0 font-mono text-sm text-white/60">{formatBytes(c.bytes)}</span>
              </button>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-between">
            <span className="text-xs text-white/40">{candidates.filter((c) => c.approved).length} approved · removable drives always excluded</span>
            <Button variant="primary" disabled={plan.reclaimableBytes === 0} onClick={execute}>
              <Trash2 size={15} /> Execute Cleanup
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
