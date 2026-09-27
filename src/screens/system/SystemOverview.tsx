import { Activity, Clock, Cpu, Gauge, MemoryStick, Wifi } from "lucide-react";
import { Panel, PanelHeader, Badge, StatBar, Sparkline } from "@/components/ui";
import { useTelemetryStore } from "@/state/telemetryStore";
import { HEALTH_META } from "@/core/safety/health";
import { formatBitrate, formatBytes, formatUptime } from "@/lib/utils";

export function SystemOverview() {
  const snapshot = useTelemetryStore((s) => s.snapshot);
  const history = useTelemetryStore((s) => s.history);
  if (!snapshot) return <div className="text-white/30">Loading telemetry…</div>;

  const health = HEALTH_META[snapshot.health];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <PanelHeader title="Live Telemetry" icon={<Activity size={14} />} className="p-0" />
            <Badge tone={health.tone} dot>{health.label}</Badge>
          </div>
          <div className="mt-4 space-y-4">
            <StatBar label="CPU" value={snapshot.cpu.usagePercent} />
            <StatBar label="GPU" value={snapshot.gpu?.usagePercent ?? 0} color="#9f8cff" />
            <StatBar label="Memory" value={snapshot.memory.usagePercent} color="#5ee6a1"
              valueLabel={`${formatBytes(snapshot.memory.usedBytes, 0)} / ${formatBytes(snapshot.memory.totalBytes, 0)}`} />
          </div>
          <div className="mt-4">
            <Sparkline data={history.map((h) => h.cpu.usagePercent)} width={640} height={44} className="w-full" />
          </div>
        </Panel>

        <Panel className="p-5">
          <PanelHeader title="Vitals" icon={<Gauge size={14} />} className="p-0" />
          <div className="mt-4 space-y-3 text-sm">
            <Vital icon={<Cpu size={14} />} label="Processor" value={snapshot.cpu.name} sub={`${snapshot.cpu.cores} cores · ${snapshot.cpu.temperatureC ?? "—"}°C`} />
            {snapshot.gpu && (
              <Vital icon={<Gauge size={14} />} label="Graphics" value={snapshot.gpu.name}
                sub={`${formatBytes(snapshot.gpu.memoryUsedMb * 1024 ** 2, 0)} / ${formatBytes(snapshot.gpu.memoryTotalMb * 1024 ** 2, 0)} · ${snapshot.gpu.temperatureC ?? "—"}°C`} />
            )}
            <Vital icon={<MemoryStick size={14} />} label="Memory" value={formatBytes(snapshot.memory.totalBytes, 0)} sub={`${snapshot.memory.usagePercent}% in use`} />
            <Vital icon={<Wifi size={14} />} label="Network" value={snapshot.network.ssidOrInterface ?? "Offline"}
              sub={`↓ ${formatBitrate(snapshot.network.downBytesPerSec)} · ↑ ${formatBitrate(snapshot.network.upBytesPerSec)}`} />
            <Vital icon={<Clock size={14} />} label="Uptime" value={formatUptime(snapshot.uptimeSeconds)} sub="Since last boot" />
          </div>
        </Panel>
      </div>

      <Panel className="p-5">
        <PanelHeader title="Per-Core Load" icon={<Cpu size={14} />} className="p-0" />
        <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-8">
          {snapshot.cpu.perCore.map((v, i) => (
            <div key={i} className="space-y-1">
              <div className="flex h-16 items-end overflow-hidden rounded-md bg-white/[0.04]">
                <div className="w-full rounded-md bg-gradient-to-t from-accent/40 to-accent transition-all duration-500"
                  style={{ height: `${Math.max(4, v)}%` }} />
              </div>
              <p className="text-center font-mono text-[10px] text-white/30">{i}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Vital({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-accent/60">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wide2 text-white/35">{label}</p>
        <p className="truncate text-white/85">{value}</p>
        <p className="truncate text-xs text-white/35">{sub}</p>
      </div>
    </div>
  );
}
