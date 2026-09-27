import { useTelemetryStore } from "@/state/telemetryStore";
import { useHardware } from "@/hooks/useHardware";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";

function pad2(n: number) {
  return Math.max(0, Math.min(99, Math.round(n))).toString().padStart(2, "0");
}
function hms(sec: number) {
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${p(Math.floor(sec / 3600))}:${p(Math.floor((sec % 3600) / 60))}:${p(Math.floor(sec % 60))}`;
}

/** A single instrument row: LABEL  07 ━━━━━━━━━  meta */
function Row({ label, value, pct, meta, dim }: { label: string; value: string; pct: number | null; meta?: string; dim?: boolean }) {
  return (
    <div className="grid grid-cols-[88px_44px_1fr_auto] items-center gap-5">
      <span className="label">{label}</span>
      <span className={cn("font-mono text-[15px] tabular", dim ? "text-white/35" : "text-white/90")}>{value}</span>
      <div className="relative h-px bg-white/[0.08]">
        {pct != null && <div className="absolute inset-y-0 left-0 bg-white/85 transition-[width] duration-700 ease-nexus" style={{ width: `${Math.min(100, pct)}%` }} />}
      </div>
      <span className="min-w-[96px] text-right font-mono text-[11px] tabular text-white/30">{meta ?? ""}</span>
    </div>
  );
}

/** Instrumentation embedded in the environment — no card, no border. */
export function InstrumentLedger() {
  const s = useTelemetryStore((st) => st.snapshot);
  const hw = useHardware();

  if (!s) {
    return (
      <div className="space-y-3">
        {["CPU", "GPU", "MEMORY", "STORAGE"].map((l) => <Row key={l} label={l} value="––" pct={0} dim />)}
        <p className="pt-2 text-micro text-white/25">Awaiting telemetry</p>
      </div>
    );
  }

  const primary = s.storage.find((d) => d.kind === "fixed") ?? s.storage[0];
  const storagePct = primary ? ((primary.totalBytes - primary.freeBytes) / primary.totalBytes) * 100 : 0;
  const gpuName = hw?.gpus.find((g) => g.name && !/intel|amd radeon\(tm\) graphics/i.test(g.name))?.name ?? hw?.gpus[0]?.name ?? s.gpu?.name ?? null;
  const gpuVram = hw?.gpus.find((g) => g.name === gpuName)?.vramTotalMb ?? (s.gpu ? s.gpu.memoryTotalMb : null);
  const gpuShort = gpuName?.replace(/^NVIDIA\s+GeForce\s+/i, "").replace(/^AMD\s+/i, "").trim() ?? null;

  return (
    <div className="space-y-3">
      <Row label="CPU" value={pad2(s.cpu.usagePercent)} pct={s.cpu.usagePercent} meta={`${s.cpu.cores} threads`} />
      <Row label="GPU" value={s.gpu ? pad2(s.gpu.usagePercent) : "––"} pct={s.gpu?.usagePercent ?? null} dim={!s.gpu} meta={gpuShort ? `${gpuShort}${gpuVram ? ` · ${Math.round(gpuVram / 1024)} GB` : ""}` : "unavailable"} />
      <Row label="MEMORY" value={pad2(s.memory.usagePercent)} pct={s.memory.usagePercent} meta={formatBytes(s.memory.totalBytes, 0)} />
      <Row label="STORAGE" value={pad2(storagePct)} pct={storagePct} meta={primary ? `${primary.mountPoint} ${formatBytes(primary.totalBytes, 0)}` : ""} />
      <div className="grid grid-cols-[88px_1fr] items-baseline gap-5 pt-3">
        <span className="label">Uptime</span>
        <span className="font-mono text-[15px] tabular text-white/80">{hms(s.uptimeSeconds)}</span>
      </div>
      <div className="grid grid-cols-[88px_1fr] items-baseline gap-5">
        <span className="label">Processes</span>
        <span className="font-mono text-[15px] tabular text-white/80">{s.processCount}</span>
      </div>
      <div className="grid grid-cols-[88px_1fr] items-baseline gap-5">
        <span className="label">Network</span>
        <span className="font-mono text-[13px] text-white/60">{s.network.online ? (s.network.downBytesPerSec + s.network.upBytesPerSec > 20_000 ? "active" : "idle") : "offline"}{s.network.ssidOrInterface ? <span className="text-white/30"> · {s.network.ssidOrInterface}</span> : null}</span>
      </div>
    </div>
  );
}
