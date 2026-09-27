import { Clock, Cpu, Gauge, ListTree, MemoryStick, Wifi, WifiOff } from "lucide-react";
import { Badge, LiveChart } from "@/components/ui";
import { useTelemetryStore } from "@/state/telemetryStore";
import { HEALTH_META } from "@/core/safety/health";
import { config } from "@/core/config";
import { formatBitrate, formatBytes, formatUptime } from "@/lib/utils";
import { cn } from "@/lib/utils";

const TONE_TEXT = {
  nominal: "text-status-nominal",
  attention: "text-status-attention",
  warning: "text-status-warning",
  critical: "text-status-critical",
} as const;

export function SystemOverview() {
  const snapshot = useTelemetryStore((s) => s.snapshot);
  const history = useTelemetryStore((s) => s.history);
  const error = useTelemetryStore((s) => s.error);

  if (!snapshot) {
    return (
      <div className="rounded-2xl border border-dashed border-white/[0.08] p-10 text-center">
        <p className="font-display text-xl tracking-wide2 text-white/70">TELEMETRY UNAVAILABLE</p>
        <p className="mt-2 text-sm text-white/40">{error ? "The system provider is not responding." : "Awaiting first sample…"}</p>
      </div>
    );
  }

  const health = HEALTH_META[snapshot.health];
  const cpuSeries = history.map((h) => h.cpu.usagePercent);
  const memSeries = history.map((h) => h.memory.usagePercent);
  const gpuSeries = history.map((h) => h.gpu?.usagePercent ?? 0);
  const netDown = history.map((h) => h.network.downBytesPerSec);
  const netMax = Math.max(1_000_000, ...netDown) * 1.15;
  const isReal = config.isTauri;

  return (
    <div className="space-y-10">
      {/* Headline */}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-[11px] uppercase tracking-cinematic text-white/30">System state</p>
          <p className={cn("mt-1 font-display text-4xl font-semibold tracking-wide2", TONE_TEXT[health.tone])} style={{ textShadow: "0 0 30px currentColor" }}>
            {health.label.toUpperCase()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 font-mono text-xs text-white/50">
          <span className="flex items-center gap-2"><Clock size={13} className="text-white/30" /> Uptime <span className="text-white/85">{formatUptime(snapshot.uptimeSeconds)}</span></span>
          <span className="flex items-center gap-2"><ListTree size={13} className="text-white/30" /> <span className="text-white/85">{snapshot.processCount}</span> processes</span>
          <Badge tone={isReal ? "nominal" : "neutral"}>{isReal ? "Live telemetry" : "Demo telemetry"}</Badge>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-x-10 gap-y-8 xl:grid-cols-4">
        <LiveChart label="CPU" value={`${snapshot.cpu.usagePercent}%`} data={cpuSeries} sublabel={`${snapshot.cpu.name} · ${snapshot.cpu.cores} threads`} />
        <LiveChart label="Memory" value={`${snapshot.memory.usagePercent}%`} data={memSeries} color="#5ee6a1" sublabel={`${formatBytes(snapshot.memory.usedBytes, 1)} of ${formatBytes(snapshot.memory.totalBytes, 0)}`} />
        <LiveChart label="GPU" value={snapshot.gpu ? `${snapshot.gpu.usagePercent}%` : undefined} unavailable={!snapshot.gpu} data={gpuSeries} color="#9f8cff" sublabel={snapshot.gpu ? `${snapshot.gpu.name} · ${formatBytes(snapshot.gpu.memoryUsedMb * 1024 ** 2, 1)} VRAM` : "No reliable GPU source — not inventing data"} />
        <LiveChart label="Network ↓" value={formatBitrate(snapshot.network.downBytesPerSec)} data={netDown} max={netMax} color="#e6a15e" sublabel={`↑ ${formatBitrate(snapshot.network.upBytesPerSec)} · ${snapshot.network.ssidOrInterface ?? "offline"}`} />
      </div>

      {/* Vitals ledger */}
      <div className="grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-2">
        <div>
          <p className="mb-3 text-[10px] uppercase tracking-cinematic text-white/30">Vitals</p>
          <dl className="divide-y divide-white/[0.05]">
            <Vital icon={<Cpu size={14} />} label="Processor" value={snapshot.cpu.name} sub={`${snapshot.cpu.cores} logical cores${snapshot.cpu.temperatureC != null ? ` · ${snapshot.cpu.temperatureC}°C` : ""}`} />
            <Vital icon={<Gauge size={14} />} label="Graphics" value={snapshot.gpu?.name ?? "Unavailable"} sub={snapshot.gpu ? `${formatBytes(snapshot.gpu.memoryUsedMb * 1024 ** 2, 0)} / ${formatBytes(snapshot.gpu.memoryTotalMb * 1024 ** 2, 0)}` : "GPU telemetry needs a vendor source; shown as unavailable rather than estimated."} />
            <Vital icon={<MemoryStick size={14} />} label="Memory" value={`${formatBytes(snapshot.memory.totalBytes, 0)} installed`} sub={`${snapshot.memory.usagePercent}% in use · ${formatBytes(snapshot.memory.totalBytes - snapshot.memory.usedBytes, 1)} free`} />
            <Vital icon={snapshot.network.online ? <Wifi size={14} /> : <WifiOff size={14} />} label="Network" value={snapshot.network.ssidOrInterface ?? "Offline"} sub={`↓ ${formatBitrate(snapshot.network.downBytesPerSec)} · ↑ ${formatBitrate(snapshot.network.upBytesPerSec)}`} />
          </dl>
        </div>

        <div>
          <p className="mb-3 text-[10px] uppercase tracking-cinematic text-white/30">Per-core load</p>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(16, Math.max(4, snapshot.cpu.perCore.length))}, minmax(0, 1fr))` }}>
            {snapshot.cpu.perCore.map((v, i) => (
              <div key={i} className="group">
                <div className="flex h-16 items-end overflow-hidden rounded-sm bg-white/[0.04]">
                  <div className="w-full rounded-sm bg-gradient-to-t from-accent/30 to-accent transition-all duration-500" style={{ height: `${Math.max(3, v)}%` }} />
                </div>
                <p className="mt-1 text-center font-mono text-[9px] text-white/25 group-hover:text-white/60">{v}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-white/30">Sampled every 1.5s · rolling 60-sample buffer kept in memory only</p>
        </div>
      </div>
    </div>
  );
}

function Vital({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="flex items-start gap-4 py-3.5">
      <span className="mt-0.5 text-accent/60">{icon}</span>
      <div className="min-w-0 flex-1">
        <dt className="text-[10px] uppercase tracking-wide2 text-white/30">{label}</dt>
        <dd className="truncate text-sm text-white/85">{value}</dd>
        <dd className="truncate text-xs text-white/35">{sub}</dd>
      </div>
    </div>
  );
}
