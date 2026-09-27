import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Check, FlaskConical, HardDrive, Lock, Search, ShieldAlert, Trash2 } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { useTelemetryStore } from "@/state/telemetryStore";
import { DEMO_DRIVES } from "@/core/demo/system";
import { demoStorageAnalysis, DEMO_CLEANUP_CANDIDATES } from "@/core/demo/storage";
import { eligibleDrivesForScan } from "@/core/storage/storageService";
import type { AnalysisConfidence, CleanupRisk, StorageAnalysis, StorageCategory } from "@/core/types";
import { requestConfirm } from "@/state/confirmStore";
import { notify } from "@/state/toastStore";
import { native, type CleanupReportItem, type NativeCleanupCandidate } from "@/providers/system/nativeBridge";
import { getProviders } from "@/providers";
import { config } from "@/core/config";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";

const CATEGORY_COLORS: Record<StorageCategory, string> = {
  games: "#e6a15e", media: "#5ed0e6", applications: "#9f8cff", system: "#8892a0",
  documents: "#5ee6a1", downloads: "#e6cf5e", temporary: "#e65e6f", other: "#3a4250",
};
const CATEGORY_LABELS: Record<StorageCategory, string> = {
  games: "Games", media: "Media (user folders)", applications: "Applications", system: "Windows / System",
  documents: "Documents", downloads: "Downloads", temporary: "Temporary", other: "Not analyzed",
};
const CONF: Record<AnalysisConfidence, { label: string; tone: "nominal" | "attention" | "neutral" }> = {
  known: { label: "KNOWN", tone: "nominal" },
  estimated: { label: "ESTIMATED", tone: "attention" },
  "not-analyzed": { label: "NOT ANALYZED", tone: "neutral" },
};

interface Candidate {
  id: string;
  label: string;
  description: string;
  bytes: number;
  fileCount: number | null;
  risk: CleanupRisk;
  requiresElevation: boolean;
  discovery: string | null;
  execution: string | null;
  approved: boolean;
}

function fromNative(c: NativeCleanupCandidate): Candidate {
  return { id: c.rule.id, label: c.rule.label, description: c.rule.description, bytes: c.bytes, fileCount: c.fileCount, risk: c.rule.risk, requiresElevation: c.rule.requiresElevation, discovery: c.rule.discovery, execution: c.rule.execution, approved: false };
}

export function StorageAnalyzer() {
  const liveDrives = useTelemetryStore((s) => s.snapshot?.storage);
  const drives = liveDrives && liveDrives.length ? liveDrives : DEMO_DRIVES;
  const eligible = useMemo(() => eligibleDrivesForScan(drives), [drives]);
  const excluded = drives.filter((d) => d.kind !== "fixed");
  const [selected, setSelected] = useState<string | null>(null);
  const drive = eligible.find((d) => d.mountPoint === selected) ?? eligible[0];
  const [analyzing, setAnalyzing] = useState(false);
  const [progressCat, setProgressCat] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<Record<string, StorageAnalysis>>({});
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [report, setReport] = useState<CleanupReportItem[] | null>(null);

  useEffect(() => {
    if (!selected && eligible[0]) setSelected(eligible[0].mountPoint);
  }, [eligible, selected]);

  // Cleanup discovery (real on desktop, demo otherwise)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDiscovering(true);
      if (config.isTauri) {
        const list = await native.cleanupDiscover();
        if (!cancelled) setCandidates((list ?? []).filter((c) => c.accessible || c.rule.id === "recycle-bin").map(fromNative));
      } else if (!cancelled) {
        setCandidates(DEMO_CLEANUP_CANDIDATES.map((c) => ({ id: c.id, label: c.label, description: c.description, bytes: c.bytes, fileCount: null, risk: c.risk, requiresElevation: false, discovery: null, execution: null, approved: false })));
      }
      setDiscovering(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const analysis: StorageAnalysis | null = drive ? analyses[drive.mountPoint] ?? demoStorageAnalysis(drive.mountPoint, drive.totalBytes, drive.freeBytes) : null;
  const isReal = drive ? !!analyses[drive.mountPoint] : false;

  const runAnalysis = async () => {
    if (!drive) return;
    setAnalyzing(true);
    if (config.isTauri) {
      let libs: string[] = [];
      try {
        const steam = getProviders().steam;
        const d = "discover" in steam ? await (steam as { discover: () => Promise<{ libraries: { path: string }[] }> }).discover() : null;
        libs = d?.libraries.map((l) => l.path) ?? [];
      } catch { /* no steam */ }
      const res = await native.storageAnalyze(drive.mountPoint, libs, (p) => setProgressCat(p.category));
      if (res) {
        setAnalyses((a) => ({ ...a, [drive.mountPoint]: { drive: res.drive, totalBytes: res.totalBytes, usedBytes: res.usedBytes, freeBytes: res.freeBytes, analyzedAt: res.analyzedAt, categories: res.categories.map((c) => ({ category: c.category as StorageCategory, bytes: c.bytes, itemCount: c.itemCount, confidence: c.confidence })) } }));
        notify.success(res.cancelled ? "Analysis stopped" : "Storage analysis complete", `${drive.mountPoint} — known locations only; nothing outside them was scanned.`);
      } else notify.warn("Analysis unavailable", "The native analyzer did not respond.");
    } else {
      await new Promise((r) => setTimeout(r, 1200));
      setAnalyses((a) => ({ ...a, [drive.mountPoint]: demoStorageAnalysis(drive.mountPoint, drive.totalBytes, drive.freeBytes) }));
      notify.success("Storage analysis complete", "Demo analysis (browser preview).");
    }
    setProgressCat(null);
    setAnalyzing(false);
  };

  const toggle = (id: string) => setCandidates((cs) => cs?.map((c) => (c.id === id ? { ...c, approved: !c.approved } : c)) ?? null);
  const approved = (candidates ?? []).filter((c) => c.approved);
  const reclaimable = approved.reduce((s, c) => s + c.bytes, 0);

  const dryRun = async () => {
    const r = await native.cleanupExecute(approved.map((c) => c.id), true);
    setReport(r);
    notify.info("Dry run complete", `${r.reduce((s, x) => s + x.removed, 0)} files · ${formatBytes(r.reduce((s, x) => s + x.freedBytes, 0))} would be freed. Nothing was deleted.`);
  };

  const execute = () => {
    if (approved.length === 0) return;
    const review = approved.filter((c) => c.risk !== "safe");
    requestConfirm({
      title: "Execute cleanup?",
      message: `Reclaim about ${formatBytes(reclaimable)} across ${approved.length} rule${approved.length === 1 ? "" : "s"}.${review.length ? ` ${review.length} marked REVIEW (e.g. Recycle Bin) — this is the last chance to restore those items.` : ""} Only files matched by each rule are removed; user documents, media and games are never touched. Removable drives are excluded.`,
      confirmLabel: "Execute",
      danger: true,
      onConfirm: async () => {
        const r = await native.cleanupExecute(approved.map((c) => c.id), false);
        setReport(r);
        const freed = r.reduce((s, x) => s + x.freedBytes, 0);
        notify.success(`Reclaimed ${formatBytes(freed)}`, `${r.reduce((s, x) => s + x.removed, 0)} items removed · ${r.reduce((s, x) => s + x.skipped, 0)} locked/skipped.`);
        if (config.isTauri) {
          const list = await native.cleanupDiscover();
          setCandidates((list ?? []).filter((c) => c.accessible || c.rule.id === "recycle-bin").map(fromNative));
        } else setCandidates((cs) => cs?.filter((c) => !c.approved) ?? null);
      },
    });
  };

  if (!drive || !analysis) return <p className="text-sm text-white/40">No eligible fixed drives detected.</p>;
  const usedPct = (analysis.usedBytes / analysis.totalBytes) * 100;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center gap-2">
        {eligible.map((d) => {
          const pct = d.totalBytes ? ((d.totalBytes - d.freeBytes) / d.totalBytes) * 100 : 0;
          return (
            <button key={d.mountPoint} onClick={() => setSelected(d.mountPoint)} className={cn("group flex min-w-[200px] items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors", drive.mountPoint === d.mountPoint ? "border-accent/40 bg-accent/[0.07]" : "border-white/[0.06] hover:border-white/15")}>
              <HardDrive size={16} className={drive.mountPoint === d.mountPoint ? "text-accent" : "text-white/35"} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white/85">{d.mountPoint} <span className="text-white/40">{d.label}</span></p>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]"><div className={cn("h-full rounded-full", pct > 88 ? "bg-status-warning" : "bg-accent/70")} style={{ width: `${pct}%` }} /></div>
              </div>
              <span className="font-mono text-xs text-white/40">{Math.round(pct)}%</span>
            </button>
          );
        })}
        {excluded.map((d) => (
          <div key={d.mountPoint} title="Removable/network drives are never scanned or cleaned. Media authorization does not change this." className="flex items-center gap-2 rounded-xl border border-dashed border-white/[0.08] px-4 py-3 text-sm text-white/30">
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
              <p className="mt-1 font-display text-4xl font-semibold tracking-wide text-white/95">{formatBytes(analysis.usedBytes, 1)} <span className="text-lg text-white/35">/ {formatBytes(analysis.totalBytes, 0)}</span></p>
              <p className="mt-1 text-sm text-white/40">{formatBytes(analysis.freeBytes, 0)} free · {Math.round(usedPct)}% used{drive.fileSystem ? ` · ${drive.fileSystem}` : ""}</p>
            </div>
            <div className="flex items-center gap-2">
              {analyzing && <Button variant="ghost" size="sm" onClick={() => void native.storageCancel()}>Stop</Button>}
              <Button variant={isReal ? "outline" : "primary"} onClick={() => void runAnalysis()} disabled={analyzing}>
                <Search size={15} className={analyzing ? "animate-pulse" : ""} /> {analyzing ? `Analyzing${progressCat ? ` · ${CATEGORY_LABELS[progressCat as StorageCategory] ?? progressCat}` : "…"}` : isReal ? "Re-analyze" : "Analyze"}
              </Button>
            </div>
          </div>

          <div className="mt-6 flex h-4 overflow-hidden rounded-full bg-white/[0.04]">
            {analysis.categories.map((c, i) => (
              <motion.div key={c.category} initial={{ width: 0 }} animate={{ width: `${(c.bytes / analysis.totalBytes) * 100}%` }} transition={{ duration: 0.8, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }} title={`${CATEGORY_LABELS[c.category]}: ${formatBytes(c.bytes)}`} style={{ background: CATEGORY_COLORS[c.category], opacity: c.confidence === "not-analyzed" ? 0.5 : 1 }} className={cn(c.confidence === "estimated" && "bg-[repeating-linear-gradient(45deg,transparent_0_4px,rgba(0,0,0,0.25)_4px_8px)]")} />
            ))}
          </div>

          <p className="mt-3 text-xs text-white/35">
            {isReal
              ? "Bounded analysis of known locations (Windows, Program Files, Steam libraries, user folders, temp). Anything else is “not analyzed” — NEXUS never walks a whole drive."
              : "Figures are illustrative until you run Analyze. Analysis only inspects known locations on this fixed drive; authorized media folders are not part of cleanup."}
          </p>

          <div className="mt-5 divide-y divide-white/[0.04]">
            {analysis.categories.map((c) => (
              <div key={c.category} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CATEGORY_COLORS[c.category] }} />
                <span className="flex-1 text-white/75">{CATEGORY_LABELS[c.category]}</span>
                <Badge tone={CONF[c.confidence].tone} className="text-[9px]">{CONF[c.confidence].label}</Badge>
                <span className="w-24 text-right text-xs text-white/30">{c.itemCount ? `${c.itemCount.toLocaleString()} files` : ""}</span>
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
              <p className="mt-1 text-sm text-white/45">Discover → propose → approve → execute → report. Every rule declares how it finds and removes files.</p>
            </div>
            <span className="font-mono text-sm text-accent">{formatBytes(reclaimable)} <span className="text-white/30">selected</span></span>
          </div>

          <div className="mt-4 space-y-2">
            {discovering && !candidates && <p className="py-6 text-center text-sm text-white/35">Discovering cleanup candidates…</p>}
            {candidates?.length === 0 && <p className="py-8 text-center text-sm text-white/35">Nothing to clean up right now.</p>}
            {candidates?.map((c) => (
              <button key={c.id} onClick={() => toggle(c.id)} className={cn("flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors", c.approved ? "border-accent/30 bg-accent/[0.06]" : "border-white/[0.06] hover:bg-white/[0.02]")}>
                <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border", c.approved ? "border-accent bg-accent text-void-950" : "border-white/15")}>{c.approved && <Check size={13} />}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm text-white/85">{c.label}</p>
                    {c.risk === "safe" && <Badge tone="nominal">SAFE</Badge>}
                    {c.risk === "review" && <Badge tone="attention">REVIEW</Badge>}
                    {c.risk === "destructive" && <Badge tone="critical"><AlertTriangle size={10} /> USER FILES</Badge>}
                    {c.requiresElevation && <Badge tone="neutral"><ShieldAlert size={10} /> some need admin</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-white/40">{c.description}</p>
                  {c.discovery && <p className="mt-1 font-mono text-[10px] text-white/25">discover: {c.discovery} · execute: {c.execution}</p>}
                </div>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-sm text-white/60">{formatBytes(c.bytes)}</span>
                  {c.fileCount != null && <span className="block text-[10px] text-white/30">{c.fileCount.toLocaleString()} items</span>}
                </span>
              </button>
            ))}
          </div>

          {report && (
            <div className="mt-4 rounded-xl border border-white/[0.07] p-4">
              <p className="text-[10px] uppercase tracking-wide2 text-white/40">{report[0]?.dryRun ? "Dry run report" : "Cleanup report"}</p>
              <div className="mt-2 divide-y divide-white/[0.04] text-xs">
                {report.map((r) => (
                  <div key={r.ruleId} className="flex items-center gap-3 py-1.5">
                    <span className="flex-1 text-white/70">{candidates?.find((c) => c.id === r.ruleId)?.label ?? r.ruleId}</span>
                    <span className="font-mono text-white/60">{formatBytes(r.freedBytes)}</span>
                    <span className="text-white/35">{r.removed} {r.dryRun ? "would remove" : "removed"}{r.skipped ? ` · ${r.skipped} skipped` : ""}</span>
                    {r.error && <span className="text-status-attention">{r.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 flex items-center justify-between">
            <span className="text-xs text-white/40">{approved.length} approved · removable drives always excluded</span>
            <div className="flex gap-2">
              <Button variant="outline" disabled={approved.length === 0} onClick={() => void dryRun()}><FlaskConical size={14} /> Dry run</Button>
              <Button variant="primary" disabled={approved.length === 0} onClick={execute}><Trash2 size={15} /> Execute</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
