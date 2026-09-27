import { motion } from "framer-motion";
import { useTelemetryStore } from "@/state/telemetryStore";
import { HEALTH_META } from "@/core/safety/health";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";

const TONE_TEXT = {
  nominal: "text-status-nominal",
  attention: "text-status-attention",
  warning: "text-status-warning",
  critical: "text-status-critical",
} as const;

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
function hms(sec: number) {
  return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(Math.floor(sec % 60))}`;
}

/** "NEXUS / NOMINAL" status block with a monospace metric ledger. */
export function NexusStatus() {
  const s = useTelemetryStore((s) => s.snapshot);
  const history = useTelemetryStore((s) => s.history);

  if (!s) {
    return (
      <div className="space-y-3">
        <p className="text-[11px] uppercase tracking-cinematic text-white/30">NEXUS</p>
        <p className="font-display text-3xl tracking-wide2 text-white/25">CALIBRATING</p>
        <p className="text-xs text-white/25">Telemetry unavailable — awaiting first sample.</p>
      </div>
    );
  }

  const health = HEALTH_META[s.health];
  const primary = s.storage.find((d) => d.kind === "fixed") ?? s.storage[0];
  const storagePct = primary ? Math.round(((primary.totalBytes - primary.freeBytes) / primary.totalBytes) * 100) : 0;

  const rows: { label: string; value: string; pct: number | null; series?: number[] }[] = [
    { label: "CPU", value: `${s.cpu.usagePercent}%`, pct: s.cpu.usagePercent, series: history.map((h) => h.cpu.usagePercent) },
    { label: "GPU", value: s.gpu ? `${s.gpu.usagePercent}%` : "N/A", pct: s.gpu?.usagePercent ?? null, series: s.gpu ? history.map((h) => h.gpu?.usagePercent ?? 0) : undefined },
    { label: "MEMORY", value: `${s.memory.usagePercent}%`, pct: s.memory.usagePercent, series: history.map((h) => h.memory.usagePercent) },
    { label: "STORAGE", value: `${storagePct}%`, pct: storagePct },
    { label: "UPTIME", value: hms(s.uptimeSeconds), pct: null },
  ];

  return (
    <div>
      <p className="text-[11px] uppercase tracking-cinematic text-white/30">NEXUS</p>
      <motion.p
        key={s.health}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn("mt-1 font-display text-3xl font-semibold tracking-wide2", TONE_TEXT[health.tone])}
        style={{ textShadow: "0 0 30px currentColor" }}
      >
        {health.label.toUpperCase()}
      </motion.p>

      <div className="mt-5 space-y-2 font-mono text-[13px]">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-4">
            <span className="w-20 text-white/35">{r.label}</span>
            <span className="w-16 tabular-nums text-white/90">{r.value}</span>
            <div className="relative h-px flex-1 bg-white/[0.06]">
              {r.pct != null && (
                <div
                  className="absolute inset-y-0 left-0 bg-accent/70 transition-all duration-700"
                  style={{ width: `${r.pct}%`, boxShadow: "0 0 8px rgba(94,208,230,0.5)" }}
                />
              )}
            </div>
            <span className="w-14 text-right text-[11px] text-white/25">
              {r.label === "MEMORY" ? formatBytes(s.memory.totalBytes, 0) : r.label === "STORAGE" && primary ? formatBytes(primary.totalBytes, 0) : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
