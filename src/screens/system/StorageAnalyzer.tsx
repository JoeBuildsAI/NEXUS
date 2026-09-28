import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Button } from "@/components/ui";
import { useTelemetryStore } from "@/state/telemetryStore";
import { useModeStore } from "@/state/modeStore";
import { DEMO_DRIVES } from "@/core/demo/system";
import { demoStorageAnalysis } from "@/core/demo/storage";
import { eligibleDrivesForScan } from "@/core/storage/storageService";
import type { AnalysisConfidence, CleanupRisk, StorageAnalysis, StorageCategory } from "@/core/types";
import { requestConfirm } from "@/state/confirmStore";
import { notify } from "@/state/toastStore";
import { native } from "@/providers/system/nativeBridge";
import { useCleanupStore, type CleanupCandidateView } from "@/state/cleanupStore";
import { getProviders } from "@/providers";
import { config } from "@/core/config";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";

const CATEGORY_LABELS: Record<StorageCategory, string> = {
  games: "Games", applications: "Applications", system: "Windows", downloads: "Downloads",
  documents: "Documents", media: "Media", temporary: "Temporary", other: "Other",
};
const ORDER: StorageCategory[] = ["games", "applications", "system", "downloads", "documents", "media", "temporary", "other"];
/** Monochrome ramp: brighter = larger/more certain. */
const SHADE: Record<StorageCategory, string> = {
  games: "rgba(255,255,255,0.85)", applications: "rgba(255,255,255,0.65)", system: "rgba(255,255,255,0.5)", downloads: "rgba(255,255,255,0.4)",
  documents: "rgba(255,255,255,0.32)", media: "rgba(255,255,255,0.26)", temporary: "rgba(217,160,102,0.7)", other: "rgba(255,255,255,0.1)",
};
const CONF: Record<AnalysisConfidence, string> = { known: "known", estimated: "estimated", "not-analyzed": "not analyzed" };
const RISK: Record<CleanupRisk, { label: string; cls: string }> = {
  safe: { label: "SAFE", cls: "text-status-nominal/80" },
  review: { label: "REVIEW", cls: "text-status-attention/90" },
  destructive: { label: "USER FILES", cls: "text-status-critical/90" },
};

type Candidate = CleanupCandidateView & { approved: boolean };
const NO_DRIVES: typeof DEMO_DRIVES = [];

export function StorageAnalyzer() {
  const liveDrives = useTelemetryStore((s) => s.snapshot?.storage);
  const gameRunning = useModeStore((s) => s.gameRunning);
  // Desktop never shows demo drives; the browser preview does (clearly illustrative).
  const drives = liveDrives && liveDrives.length ? liveDrives : config.isTauri ? NO_DRIVES : DEMO_DRIVES;
  const eligible = useMemo(() => eligibleDrivesForScan(drives), [drives]);
  const excluded = drives.filter((d) => d.kind !== "fixed");
  const [selected, setSelected] = useState<string | null>(null);
  const drive = eligible.find((d) => d.mountPoint === selected) ?? eligible[0];
  const [analyzing, setAnalyzing] = useState(false);
  const [progressCat, setProgressCat] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<Record<string, StorageAnalysis>>({});
  const storeCandidates = useCleanupStore((s) => s.candidates);
  const report = useCleanupStore((s) => s.lastReport);
  const executeRules = useCleanupStore((s) => s.execute);
  const [approvedIds, setApprovedIds] = useState<string[]>([]);
  const [showRules, setShowRules] = useState(false);
  const candidates: Candidate[] | null = useMemo(() => storeCandidates?.map((c) => ({ ...c, approved: approvedIds.includes(c.id) })) ?? null, [storeCandidates, approvedIds]);

  useEffect(() => { if (!selected && eligible[0]) setSelected(eligible[0].mountPoint); }, [eligible, selected]);

  useEffect(() => { void useCleanupStore.getState().discover(); }, []);

  // Before Analyze the desktop shows only real used/free — never invented per-category sizes.
  const analysis: StorageAnalysis | null = drive
    ? analyses[drive.mountPoint] ?? (config.isTauri
      ? { drive: drive.mountPoint, totalBytes: drive.totalBytes, usedBytes: drive.totalBytes - drive.freeBytes, freeBytes: drive.freeBytes, analyzedAt: 0, categories: [] }
      : demoStorageAnalysis(drive.mountPoint, drive.totalBytes, drive.freeBytes))
    : null;
  const isReal = drive ? !!analyses[drive.mountPoint] : false;

  const runAnalysis = async () => {
    if (!drive) return;
    setAnalyzing(true);
    if (config.isTauri) {
      let libs: string[] = [];
      try {
        const steam = getProviders().steam as { discover?: () => Promise<{ libraries: { path: string }[] }> };
        libs = (await steam.discover?.())?.libraries.map((l) => l.path) ?? [];
      } catch { /* no steam */ }
      const res = await native.storageAnalyze(drive.mountPoint, libs, (p) => setProgressCat(p.category));
      if (res) {
        setAnalyses((a) => ({ ...a, [drive.mountPoint]: { drive: res.drive, totalBytes: res.totalBytes, usedBytes: res.usedBytes, freeBytes: res.freeBytes, analyzedAt: res.analyzedAt, categories: res.categories.map((c) => ({ category: c.category as StorageCategory, bytes: c.bytes, itemCount: c.itemCount, confidence: c.confidence })) } }));
        notify.success(res.cancelled ? "Analysis stopped" : "Analysis complete", `${drive.mountPoint} · known locations only`);
      } else notify.warn("Analysis unavailable", "The native analyzer did not respond.");
    } else {
      await new Promise((r) => setTimeout(r, 1000));
      setAnalyses((a) => ({ ...a, [drive.mountPoint]: demoStorageAnalysis(drive.mountPoint, drive.totalBytes, drive.freeBytes) }));
      notify.success("Analysis complete", "Demo analysis (browser preview)");
    }
    setProgressCat(null);
    setAnalyzing(false);
  };

  const toggle = (id: string) => setApprovedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const approved = (candidates ?? []).filter((c) => c.approved);
  const reclaimable = approved.reduce((s, c) => s + c.bytes, 0);
  const reviewable = (candidates ?? []).filter((c) => c.risk !== "destructive").reduce((s, c) => s + c.bytes, 0);

  const dryRun = async () => {
    const r = await executeRules(approved.map((c) => c.id), true);
    notify.info("Dry run complete", `${formatBytes(r.reduce((s, x) => s + x.freedBytes, 0))} would be freed. Nothing was deleted.`);
  };
  const execute = () => {
    if (approved.length === 0) return;
    const review = approved.filter((c) => c.risk !== "safe");
    requestConfirm({
      title: `Remove ${formatBytes(reclaimable)} of temporary data?`,
      message: [
        ...approved.map((c) => `${c.label} — ${formatBytes(c.bytes)}${c.risk !== "safe" ? " (review)" : ""}`),
        "",
        "No user documents, media or games are selected. Only files each rule matches are removed; removable drives are excluded." + (review.length ? " The Recycle Bin is the last chance to restore those items." : ""),
      ].join("\n"),
      confirmLabel: "Clean",
      cancelLabel: "Review",
      danger: true,
      onConfirm: async () => {
        const r = await executeRules(approved.map((c) => c.id), false);
        const freed = r.reduce((s, x) => s + x.freedBytes, 0);
        notify.success(`${formatBytes(freed)} recovered`, `${r.reduce((s, x) => s + x.removed, 0)} items removed${r.reduce((s, x) => s + x.skipped, 0) ? ` · ${r.reduce((s, x) => s + x.skipped, 0)} skipped (locked or in use)` : ""}`);
        setApprovedIds([]);
      },
    });
  };

  if (!drive || !analysis) return <p className="text-sm text-white/40">{config.isTauri && !liveDrives ? "Reading drives…" : "No eligible fixed drives detected."}</p>;
  const cats = ORDER.map((k) => analysis.categories.find((c) => c.category === k)).filter((c): c is NonNullable<typeof c> => !!c);

  return (
    <div className="space-y-16">
      {/* Drive selector — typographic */}
      <div className="flex flex-wrap items-baseline gap-8">
        {eligible.map((d) => (
          <button key={d.mountPoint} onClick={() => setSelected(d.mountPoint)} className={cn("relative pb-2 font-mono text-[13px] tabular transition-colors", drive.mountPoint === d.mountPoint ? "text-white" : "text-white/35 hover:text-white/70")}>
            {d.mountPoint} <span className="ml-1 font-sans text-white/40">{d.label}</span>
            {drive.mountPoint === d.mountPoint && <span className="absolute inset-x-0 bottom-0 h-px bg-white" />}
          </button>
        ))}
        {excluded.map((d) => (
          <span key={d.mountPoint} className="pb-2 font-mono text-[13px] text-white/20" title="Removable/network drives are never scanned or cleaned.">{d.mountPoint} <span className="font-sans">excluded</span></span>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-x-24 gap-y-16 xl:grid-cols-[1.1fr_1fr]">
        {/* Usage */}
        <div>
          <div className="flex flex-wrap items-end justify-between gap-8">
            <div className="flex gap-16">
              <div>
                <p className="font-sans text-display-xl font-semibold tabular tracking-tight text-white">{formatBytes(analysis.usedBytes, analysis.usedBytes >= 1024 ** 4 ? 2 : 0)}</p>
                <p className="label mt-2">Used</p>
              </div>
              <div>
                <p className="font-sans text-display-xl font-semibold tabular tracking-tight text-white/45">{formatBytes(analysis.freeBytes, 0)}</p>
                <p className="label mt-2">Available</p>
              </div>
            </div>
            <div className="flex items-center gap-3 pb-2">
              {analyzing && <Button variant="ghost" size="sm" onClick={() => void native.storageCancel()}>Stop</Button>}
              <Button variant={isReal ? "outline" : "primary"} size="sm" onClick={() => void runAnalysis()} disabled={analyzing || gameRunning} title={gameRunning ? "Paused while a game session is active" : undefined}>
                {gameRunning ? "Paused · game running" : analyzing ? `Analyzing${progressCat ? ` · ${CATEGORY_LABELS[progressCat as StorageCategory] ?? progressCat}` : ""}` : isReal ? "Re-analyze" : "Analyze"}
              </Button>
            </div>
          </div>

          <div className="mt-10 flex h-[3px] overflow-hidden rounded-full bg-white/[0.05]">
            {cats.map((c, i) => (
              <motion.div key={c.category} initial={{ width: 0 }} animate={{ width: `${(c.bytes / analysis.totalBytes) * 100}%` }} transition={{ duration: 0.9, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }} style={{ background: SHADE[c.category] }} title={`${CATEGORY_LABELS[c.category]} · ${formatBytes(c.bytes)}`} />
            ))}
          </div>

          <div className="mt-8 divide-y divide-white/[0.05]">
            {cats.map((c) => (
              <div key={c.category} className="grid grid-cols-[12px_1fr_auto_auto] items-baseline gap-4 py-3">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: SHADE[c.category] }} />
                <span className="text-[14px] text-white/80">{CATEGORY_LABELS[c.category]}<span className="ml-3 text-micro text-white/25">{CONF[c.confidence]}</span></span>
                <span className="font-mono text-[11px] tabular text-white/25">{c.itemCount ? `${c.itemCount.toLocaleString()} files` : ""}</span>
                <span className="w-20 text-right font-mono text-[13px] tabular text-white/70">{formatBytes(c.bytes)}</span>
              </div>
            ))}
          </div>
          <p className="mt-5 max-w-lg text-[12px] leading-relaxed text-white/30">
            {isReal ? "Bounded analysis of known locations — Windows, Program Files, Steam libraries, user folders, temp. Everything else is “other”. NEXUS never walks a whole drive." : config.isTauri ? "Run Analyze to see what is using space. It inspects known locations on this fixed drive only; authorized media folders are never part of cleanup." : "Illustrative until you run Analyze. Analysis inspects known locations on this fixed drive only; authorized media folders are never part of cleanup."}
          </p>
        </div>

        {/* Cleanup */}
        <div>
          <p className="font-sans text-display-lg font-semibold tabular tracking-tight text-white">{formatBytes(reviewable, 0)}<span className="ml-3 font-sans text-base font-normal text-white/40">reviewable</span></p>
          <p className="mt-2 text-[13px] text-white/40">Discover → propose → approve → execute → report.</p>

          <div className="mt-8 divide-y divide-white/[0.05]">
            {candidates === null && <p className="py-6 text-micro text-white/30">Discovering</p>}
            {candidates?.length === 0 && <p className="py-6 text-sm text-white/35">Nothing to clean up right now.</p>}
            {candidates?.map((c) => (
              <button key={c.id} onClick={() => toggle(c.id)} className="group grid w-full grid-cols-[20px_1fr_auto] items-start gap-4 py-4 text-left">
                <span className={cn("mt-1 flex h-4 w-4 items-center justify-center rounded-[3px] border transition-colors", c.approved ? "border-white bg-white text-black" : "border-white/20 group-hover:border-white/50")}>{c.approved && <Check size={11} strokeWidth={3} />}</span>
                <span className="min-w-0">
                  <span className="flex items-baseline gap-3">
                    <span className="text-[15px] text-white/85">{c.label}</span>
                    <span className={cn("text-micro", RISK[c.risk].cls)}>{RISK[c.risk].label}</span>
                    {c.requiresElevation && <span className="text-micro text-white/30">some need admin</span>}
                  </span>
                  <span className="mt-1 block text-[12.5px] leading-relaxed text-white/40">{c.description}</span>
                  {showRules && c.discovery && <span className="mt-1 block font-mono text-[10px] text-white/25">discover: {c.discovery} · execute: {c.execution}</span>}
                </span>
                <span className="text-right">
                  <span className="block font-mono text-[15px] tabular text-white/80">{formatBytes(c.bytes)}</span>
                  {c.fileCount != null && <span className="block font-mono text-[10px] tabular text-white/30">{c.fileCount.toLocaleString()} items</span>}
                </span>
              </button>
            ))}
          </div>

          {report && (
            <div className="mt-6 border-t border-white/[0.06] pt-4">
              <p className="label">{report[0]?.dryRun ? "Dry run report" : "Cleanup report"}</p>
              <div className="mt-2 divide-y divide-white/[0.04] text-[12.5px]">
                {report.map((r) => (
                  <div key={r.ruleId} className="flex items-baseline gap-4 py-1.5">
                    <span className="flex-1 text-white/65">{candidates?.find((c) => c.id === r.ruleId)?.label ?? r.ruleId}</span>
                    <span className="font-mono tabular text-white/70">{formatBytes(r.freedBytes)}</span>
                    <span className="font-mono text-[11px] text-white/35">{r.removed} {r.dryRun ? "would remove" : "removed"}{r.skipped ? ` · ${r.skipped} skipped` : ""}</span>
                    {r.error && <span className="text-[11px] text-status-attention">{r.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            <button onClick={() => setShowRules((v) => !v)} className="text-micro text-white/30 transition-colors hover:text-white">{showRules ? "hide rule details" : "rule details"}</button>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[12px] tabular text-white/40">{approved.length ? `${formatBytes(reclaimable)} selected` : ""}</span>
              <Button variant="ghost" size="sm" disabled={approved.length === 0} onClick={() => void dryRun()}>Dry run</Button>
              <Button variant="primary" size="sm" disabled={approved.length === 0} onClick={execute}>Execute</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
