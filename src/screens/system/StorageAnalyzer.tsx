import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  HardDrive,
  Lock,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Panel, PanelHeader, Badge, Button } from "@/components/ui";
import { DEMO_DRIVES } from "@/core/demo/system";
import { demoStorageAnalysis, DEMO_CLEANUP_CANDIDATES } from "@/core/demo/storage";
import {
  buildPlan,
  eligibleDrivesForScan,
  validateExecution,
} from "@/core/storage/storageService";
import type { CleanupCandidate, StorageCategory } from "@/core/types";
import { requestConfirm } from "@/state/confirmStore";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";

const CATEGORY_COLORS: Record<StorageCategory, string> = {
  games: "#e6a15e",
  media: "#5ed0e6",
  applications: "#9f8cff",
  system: "#8892a0",
  documents: "#5ee6a1",
  downloads: "#e6cf5e",
  temporary: "#e65e6f",
  other: "#5a6472",
};

const CATEGORY_LABELS: Record<StorageCategory, string> = {
  games: "Games",
  media: "Media",
  applications: "Applications",
  system: "Windows / System",
  documents: "Documents",
  downloads: "Downloads",
  temporary: "Temporary",
  other: "Other",
};

export function StorageAnalyzer() {
  const eligible = useMemo(() => eligibleDrivesForScan(DEMO_DRIVES), []);
  const [drive, setDrive] = useState(eligible[0]?.mountPoint ?? "C:\\");
  const analysis = useMemo(() => demoStorageAnalysis(drive), [drive]);
  const [candidates, setCandidates] = useState<CleanupCandidate[]>(
    () => DEMO_CLEANUP_CANDIDATES.map((c) => ({ ...c })),
  );

  const plan = buildPlan(candidates);
  const removableDrives = DEMO_DRIVES.filter((d) => d.kind === "removable");

  const toggle = (id: string) =>
    setCandidates((cs) =>
      cs.map((c) => (c.id === id ? { ...c, approved: !c.approved } : c)),
    );

  const execute = () => {
    const errors = validateExecution(plan);
    if (errors.length) return;
    const approved = candidates.filter((c) => c.approved);
    const hasDestructive = approved.some((c) => c.risk === "destructive");
    requestConfirm({
      title: "Execute cleanup?",
      message: `NEXUS will reclaim ${formatBytes(plan.reclaimableBytes)} across ${approved.length} item(s).${
        hasDestructive
          ? " This includes items marked DESTRUCTIVE that may contain your own files."
          : ""
      } This action runs the approved cleanup only.`,
      confirmLabel: "Execute",
      danger: true,
      onConfirm: () =>
        setCandidates((cs) => cs.filter((c) => !c.approved)),
    });
  };

  return (
    <div className="space-y-4">
      {/* Drive selector */}
      <div className="flex flex-wrap items-center gap-2">
        {eligible.map((d) => (
          <button
            key={d.mountPoint}
            onClick={() => setDrive(d.mountPoint)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
              drive === d.mountPoint
                ? "border-accent/30 bg-accent/10 text-accent"
                : "border-white/[0.06] text-white/60 hover:text-white/85",
            )}
          >
            <HardDrive size={14} />
            {d.mountPoint} {d.label}
          </button>
        ))}
        {removableDrives.map((d) => (
          <div
            key={d.mountPoint}
            title="Removable drives are never scanned automatically. Opt in from settings."
            className="flex items-center gap-2 rounded-lg border border-dashed border-white/[0.08] px-3 py-2 text-sm text-white/30"
          >
            <Lock size={13} />
            {d.mountPoint} {d.label} · excluded
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Category breakdown */}
        <Panel className="p-5">
          <PanelHeader title="Storage Breakdown" icon={<HardDrive size={14} />} className="p-0" />
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold text-white/90">
              {formatBytes(analysis.usedBytes)}
            </span>
            <span className="text-sm text-white/40">
              used of {formatBytes(analysis.totalBytes)} · {formatBytes(analysis.freeBytes)} free
            </span>
          </div>

          {/* Stacked bar */}
          <div className="mt-4 flex h-3 overflow-hidden rounded-full">
            {analysis.categories.map((c) => (
              <div
                key={c.category}
                style={{
                  width: `${(c.bytes / analysis.usedBytes) * 100}%`,
                  background: CATEGORY_COLORS[c.category],
                }}
                title={`${CATEGORY_LABELS[c.category]}: ${formatBytes(c.bytes)}`}
              />
            ))}
          </div>

          <div className="mt-4 space-y-1.5">
            {analysis.categories.map((c) => (
              <div key={c.category} className="flex items-center gap-2.5 text-sm">
                <span
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ background: CATEGORY_COLORS[c.category] }}
                />
                <span className="flex-1 text-white/70">{CATEGORY_LABELS[c.category]}</span>
                <span className="text-xs text-white/35">{c.itemCount.toLocaleString()} items</span>
                <span className="w-20 text-right font-mono text-white/60">
                  {formatBytes(c.bytes)}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        {/* Cleanup — DISCOVER → PROPOSE → APPROVE → EXECUTE */}
        <Panel className="flex flex-col p-5">
          <div className="flex items-center justify-between">
            <PanelHeader title="Safe Cleanup" icon={<Sparkles size={14} />} className="p-0" />
            <Badge tone="accent">
              {formatBytes(plan.reclaimableBytes)} selected
            </Badge>
          </div>
          <p className="mt-2 text-xs text-white/40">
            Discovered candidates. Nothing is deleted until you approve and execute.
          </p>

          <div className="mt-3 flex-1 space-y-2 overflow-y-auto">
            {candidates.map((c) => (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
                  c.approved
                    ? "border-accent/30 bg-accent/[0.07]"
                    : "border-white/[0.06] hover:bg-white/[0.02]",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                    c.approved
                      ? "border-accent bg-accent text-void-950"
                      : "border-white/15",
                  )}
                >
                  {c.approved && <Check size={13} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-white/85">{c.label}</p>
                    {c.risk === "destructive" && (
                      <Badge tone="critical">
                        <AlertTriangle size={10} /> Destructive
                      </Badge>
                    )}
                    {c.risk === "review" && <Badge tone="attention">Review</Badge>}
                    {c.risk === "safe" && <Badge tone="nominal">Safe</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-white/40">{c.description}</p>
                </div>
                <span className="shrink-0 font-mono text-sm text-white/60">
                  {formatBytes(c.bytes)}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-4">
            <span className="text-xs text-white/40">
              {candidates.filter((c) => c.approved).length} approved
            </span>
            <Button
              variant="primary"
              disabled={plan.reclaimableBytes === 0}
              onClick={execute}
            >
              <Trash2 size={15} /> Execute Cleanup
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
