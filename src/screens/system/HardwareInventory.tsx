import { Cpu, Gauge, HardDrive, MemoryStick, Monitor, Usb } from "lucide-react";
import { Badge } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { native } from "@/providers/system/nativeBridge";
import { useTelemetryStore } from "@/state/telemetryStore";
import { config } from "@/core/config";
import { formatBytes } from "@/lib/utils";

export function HardwareInventory() {
  const { data, loading } = useAsync(() => native.hardware(), []);
  const snapshot = useTelemetryStore((s) => s.snapshot);

  if (!config.isTauri) {
    return (
      <div className="rounded-2xl border border-dashed border-white/[0.08] p-10 text-center">
        <p className="font-display text-xl tracking-cinematic text-white/70">HARDWARE INVENTORY</p>
        <p className="mt-2 text-sm text-white/40">Available in the desktop build, where NEXUS can read Windows hardware information.</p>
        {snapshot && <p className="mt-4 text-xs text-white/30">Demo telemetry reports: {snapshot.cpu.name} · {snapshot.cpu.cores} cores · {formatBytes(snapshot.memory.totalBytes, 0)}{snapshot.gpu ? ` · ${snapshot.gpu.name}` : ""}</p>}
      </div>
    );
  }
  if (loading && !data) return <p className="text-sm text-white/40">Reading hardware…</p>;
  if (!data) return <p className="text-sm text-white/40">Hardware information unavailable.</p>;

  const fixed = data.drives.filter((d) => d.kind === "fixed");
  const removable = data.drives.filter((d) => d.kind !== "fixed");

  return (
    <div className="grid grid-cols-1 gap-x-14 gap-y-10 lg:grid-cols-2">
      <div className="space-y-8">
        <Block icon={<Cpu size={14} />} title="Processor">
          <Row k="Model" v={data.cpuName} />
          <Row k="Cores" v={`${data.physicalCores ?? "?"} physical · ${data.logicalCores} logical`} />
        </Block>
        <Block icon={<MemoryStick size={14} />} title="Memory">
          <Row k="Installed" v={formatBytes(data.totalMemoryBytes, 1)} />
          {snapshot && <Row k="In use" v={`${formatBytes(snapshot.memory.usedBytes, 1)} (${snapshot.memory.usagePercent}%)`} />}
        </Block>
        <Block icon={<Gauge size={14} />} title="Graphics">
          {data.gpus.length === 0 && <p className="text-sm text-white/40">No display adapter reported.</p>}
          {data.gpus.map((g, i) => (
            <div key={i} className="space-y-1.5">
              <Row k="Adapter" v={g.name ?? "Unknown"} />
              <Row k="VRAM" v={g.vramTotalMb ? formatBytes(g.vramTotalMb * 1024 ** 2, 0) : "Unknown"} />
              {g.driverVersion && <Row k="Driver" v={g.driverVersion} />}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Cap label="Utilization" ok={g.utilizationSupported} />
                <Cap label="Temperature" ok={g.temperatureSupported} />
                <Cap label="VRAM usage" ok={g.memorySupported} />
              </div>
              <p className="text-[11px] text-white/30">Live GPU counters need a vendor-specific source; NEXUS reports “unsupported” rather than estimating.</p>
            </div>
          ))}
        </Block>
        <Block icon={<Monitor size={14} />} title="Windows">
          <Row k="Edition" v={`${data.osName} ${data.osVersion}`.trim()} />
          <Row k="Build" v={data.kernelVersion || "—"} />
          <Row k="Architecture" v={data.arch} />
          <Row k="Machine" v={data.hostname} />
        </Block>
      </div>

      <div className="space-y-8">
        <Block icon={<HardDrive size={14} />} title={`Fixed drives · ${fixed.length}`}>
          {fixed.map((d) => <Drive key={d.mountPoint} d={d} />)}
        </Block>
        <Block icon={<Usb size={14} />} title={`Removable / other · ${removable.length}`}>
          {removable.length === 0 && <p className="text-sm text-white/35">None connected.</p>}
          {removable.map((d) => <Drive key={d.mountPoint} d={d} />)}
          {removable.length > 0 && (
            <p className="mt-2 text-[11px] leading-relaxed text-white/30">
              Shown for inventory only. Display is not authorization: Storage Analyzer and cleanup never inspect removable content, and the media workspace only reads folders you explicitly authorize.
            </p>
          )}
        </Block>
      </div>
    </div>
  );
}

function Block({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-cinematic text-white/30"><span className="text-accent/60">{icon}</span>{title}</p>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline gap-4 text-sm">
      <span className="w-28 shrink-0 text-white/35">{k}</span>
      <span className="truncate text-white/80" title={v}>{v}</span>
    </div>
  );
}
function Cap({ label, ok }: { label: string; ok: boolean }) {
  return <Badge tone={ok ? "nominal" : "neutral"}>{label} · {ok ? "supported" : "unsupported"}</Badge>;
}
function Drive({ d }: { d: { mountPoint: string; label: string; kind: string; totalBytes: number; freeBytes: number; fileSystem: string | null } }) {
  const used = d.totalBytes - d.freeBytes;
  const pct = d.totalBytes ? (used / d.totalBytes) * 100 : 0;
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-white/80">{d.mountPoint} <span className="text-white/40">{d.label}</span> {d.kind !== "fixed" && <Badge tone="attention" className="ml-2">{d.kind}</Badge>}</span>
        <span className="font-mono text-xs text-white/45">{formatBytes(used, 0)} / {formatBytes(d.totalBytes, 0)}{d.fileSystem ? ` · ${d.fileSystem}` : ""}</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-accent/60" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
