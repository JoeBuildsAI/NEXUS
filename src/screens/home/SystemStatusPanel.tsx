import { Cpu, HardDrive, MemoryStick, Wifi } from "lucide-react";
import { Panel, PanelHeader, ProgressRing, Badge, Sparkline } from "@/components/ui";
import { useTelemetryStore } from "@/state/telemetryStore";
import { HEALTH_META } from "@/core/safety/health";
import { formatBitrate, formatBytes } from "@/lib/utils";

export function SystemStatusPanel() {
  const snapshot = useTelemetryStore((s) => s.snapshot);
  const history = useTelemetryStore((s) => s.history);

  if (!snapshot) {
    return (
      <Panel className="h-full min-h-[220px] animate-pulse">
        <PanelHeader title="System" icon={<Cpu size={14} />} />
      </Panel>
    );
  }

  const health = HEALTH_META[snapshot.health];
  const primaryDrive = snapshot.storage[0];
  const driveUsed = primaryDrive
    ? ((primaryDrive.totalBytes - primaryDrive.freeBytes) / primaryDrive.totalBytes) * 100
    : 0;

  return (
    <Panel className="h-full">
      <PanelHeader
        title="System"
        icon={<Cpu size={14} />}
        action={<Badge tone={health.tone} dot>{health.label}</Badge>}
      />
      <div className="grid grid-cols-4 gap-2 px-5 pb-4">
        <Gauge label="CPU" value={snapshot.cpu.usagePercent} />
        <Gauge
          label="GPU"
          value={snapshot.gpu?.usagePercent ?? 0}
          color="#9f8cff"
        />
        <Gauge label="RAM" value={snapshot.memory.usagePercent} color="#5ee6a1" />
        <Gauge label="SSD" value={driveUsed} color="#e6a15e" />
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-white/[0.05] px-5 py-4 text-xs">
        <Row icon={<Cpu size={13} />} label={snapshot.cpu.name}>
          {snapshot.cpu.cores} cores
          {snapshot.cpu.temperatureC != null && ` · ${snapshot.cpu.temperatureC}°C`}
        </Row>
        <Row icon={<MemoryStick size={13} />} label="Memory">
          {formatBytes(snapshot.memory.usedBytes, 0)} / {formatBytes(snapshot.memory.totalBytes, 0)}
        </Row>
        <Row icon={<HardDrive size={13} />} label={primaryDrive?.label ?? "Storage"}>
          {primaryDrive && `${formatBytes(primaryDrive.freeBytes, 0)} free`}
        </Row>
        <Row icon={<Wifi size={13} />} label="Network">
          ↓ {formatBitrate(snapshot.network.downBytesPerSec)}
        </Row>
      </div>

      <div className="px-5 pb-4">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wide2 text-white/30">
          <span>CPU load</span>
          <span>Live</span>
        </div>
        <Sparkline
          data={history.map((h) => h.cpu.usagePercent)}
          width={520}
          height={40}
          className="mt-1 w-full"
        />
      </div>
    </Panel>
  );
}

function Gauge({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex flex-col items-center">
      <ProgressRing value={value} label={label} size={84} color={color} />
    </div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-white/50">
      <span className="text-accent/60">{icon}</span>
      <span className="truncate text-white/70">{label}</span>
      <span className="ml-auto shrink-0 font-mono text-white/45">{children}</span>
    </div>
  );
}
