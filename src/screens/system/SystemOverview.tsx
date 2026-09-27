import { LiveChart } from "@/components/ui";
import { useTelemetryStore } from "@/state/telemetryStore";
import { useHardware } from "@/hooks/useHardware";
import { HEALTH_META } from "@/core/safety/health";
import { config } from "@/core/config";
import { formatBitrate, formatBytes, formatUptime, formatVram } from "@/lib/utils";
import { cn } from "@/lib/utils";

const TONE_TEXT = { nominal: "text-white", attention: "text-status-attention", warning: "text-status-warning", critical: "text-status-critical" } as const;

/** Hardware control surface: thin instruments on black. */
export function SystemOverview() {
  const snapshot = useTelemetryStore((s) => s.snapshot);
  const history = useTelemetryStore((s) => s.history);
  const error = useTelemetryStore((s) => s.error);
  const hw = useHardware();

  if (!snapshot) {
    return (
      <div className="py-20">
        <p className="text-micro tracking-cinematic text-white/35">Telemetry</p>
        <p className="mt-3 font-display text-display-md uppercase tracking-wide text-white/70">Unavailable</p>
        <p className="mt-3 text-sm text-white/40">{error ? "The system provider is not responding." : "Awaiting first sample."}</p>
      </div>
    );
  }

  const health = HEALTH_META[snapshot.health];
  const gpu = hw?.gpus.find((g) => g.name && !/intel|amd radeon\(tm\) graphics/i.test(g.name)) ?? hw?.gpus[0];
  const netDown = history.map((h) => h.down);
  const netMax = Math.max(1_000_000, ...netDown) * 1.15;

  return (
    <div className="space-y-16">
      <div className="flex flex-wrap items-end justify-between gap-8">
        <div>
          <p className="text-micro tracking-cinematic text-white/35">Status</p>
          <p className={cn("mt-3 font-display text-display-lg font-semibold uppercase tracking-wide2", TONE_TEXT[health.tone])}>{health.label}</p>
        </div>
        <div className="flex flex-wrap gap-10 font-mono text-[12px] tabular text-white/40">
          <span><span className="text-white/85">{formatUptime(snapshot.uptimeSeconds)}</span> uptime</span>
          <span><span className="text-white/85">{snapshot.processCount}</span> processes</span>
          <span>{config.isTauri ? "live telemetry" : "demo telemetry"}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-12 gap-y-12 xl:grid-cols-4">
        <LiveChart label="CPU" value={`${snapshot.cpu.usagePercent}%`} data={history.map((h) => h.cpu)} sublabel={`${snapshot.cpu.name} · ${snapshot.cpu.cores} threads`} />
        <LiveChart label="Memory" value={`${snapshot.memory.usagePercent}%`} data={history.map((h) => h.memory)} sublabel={`${formatBytes(snapshot.memory.usedBytes, 1)} of ${formatBytes(snapshot.memory.totalBytes, 0)}`} />
        <LiveChart label="GPU" value={snapshot.gpu ? `${snapshot.gpu.usagePercent}%` : undefined} unavailable={!snapshot.gpu} data={history.map((h) => h.gpu ?? 0)} sublabel={gpu?.name ?? snapshot.gpu?.name ?? "No adapter reported"} />
        <LiveChart label="Network" value={formatBitrate(snapshot.network.downBytesPerSec)} data={netDown} max={netMax} sublabel={`↑ ${formatBitrate(snapshot.network.upBytesPerSec)} · ${snapshot.network.ssidOrInterface ?? "offline"}`} />
      </div>

      <div className="grid grid-cols-1 gap-x-16 gap-y-12 lg:grid-cols-[1fr_1.2fr]">
        <dl className="divide-y divide-white/[0.05]">
          <Vital label="Processor" value={snapshot.cpu.name} sub={`${hw?.physicalCores ? `${hw.physicalCores} cores · ` : ""}${snapshot.cpu.cores} threads${snapshot.cpu.temperatureC != null ? ` · ${snapshot.cpu.temperatureC}°C` : ""}`} />
          <Vital
            label="Graphics"
            value={snapshot.gpu?.name ?? gpu?.name ?? "Unavailable"}
            sub={
              snapshot.gpu
                ? `${formatBytes(snapshot.gpu.memoryUsedMb * 1024 ** 2, 1)} of ${formatBytes(snapshot.gpu.memoryTotalMb * 1024 ** 2, 0)} dedicated · temperature unsupported${(snapshot.gpuAdapters?.length ?? 0) > 1 ? ` · ${snapshot.gpuAdapters!.length - 1} other adapter${snapshot.gpuAdapters!.length - 1 === 1 ? "" : "s"}` : ""}`
                : gpu?.vramTotalMb
                  ? `${formatVram(gpu.vramTotalMb)} · live counters unavailable on this build`
                  : "GPU counters need a vendor source; shown as unavailable rather than estimated."
            }
          />
          <Vital label="Memory" value={`${formatBytes(snapshot.memory.totalBytes, 0)} installed`} sub={`${snapshot.memory.usagePercent}% in use · ${formatBytes(snapshot.memory.totalBytes - snapshot.memory.usedBytes, 1)} free`} />
          <Vital label="Network" value={snapshot.network.ssidOrInterface ?? "Offline"} sub={`↓ ${formatBitrate(snapshot.network.downBytesPerSec)} · ↑ ${formatBitrate(snapshot.network.upBytesPerSec)}`} />
        </dl>

        <div>
          <p className="label mb-4">Per-thread load</p>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(16, Math.max(4, snapshot.cpu.perCore.length))}, minmax(0, 1fr))` }}>
            {snapshot.cpu.perCore.map((v, i) => (
              <div key={i} className="group">
                <div className="flex h-14 items-end overflow-hidden rounded-[2px] bg-white/[0.04]">
                  <div className="w-full bg-white/80 transition-[height] duration-500 ease-nexus" style={{ height: `${Math.max(3, v)}%` }} />
                </div>
                <p className="mt-1 text-center font-mono text-[9px] text-white/20 group-hover:text-white/60">{v}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] text-white/30">Sampled every 1.5s · 60-sample buffer in memory only · slowed to 6s during a game session</p>
        </div>
      </div>
    </div>
  );
}

function Vital({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-baseline gap-4 py-4">
      <dt className="label">{label}</dt>
      <dd className="min-w-0">
        <p className="truncate text-[15px] text-white/85">{value}</p>
        <p className="mt-0.5 text-[12px] text-white/35">{sub}</p>
      </dd>
    </div>
  );
}
