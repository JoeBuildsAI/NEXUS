import { useHardware } from "@/hooks/useHardware";
import { useTelemetryStore } from "@/state/telemetryStore";
import { config } from "@/core/config";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";

/** Split "NVIDIA GeForce RTX 5090" → ["NVIDIA", "GEFORCE RTX 5090"]. */
function splitVendor(name: string): [string, string] {
  const m = /^(NVIDIA|AMD|Intel)\s+(.*)$/i.exec(name.trim());
  return m ? [m[1]!.toUpperCase(), m[2]!.replace(/\(TM\)|\(R\)/gi, "").trim().toUpperCase()] : ["", name.toUpperCase()];
}

/** Detected hardware as a spec sheet. No scores, no invented figures. */
export function HardwareInventory() {
  const hw = useHardware();
  const snapshot = useTelemetryStore((s) => s.snapshot);

  if (!config.isTauri) {
    return (
      <div className="py-10">
        <p className="text-micro tracking-cinematic text-white/35">Hardware</p>
        <p className="mt-3 font-display text-display-md uppercase tracking-wide text-white/70">Desktop build only</p>
        <p className="mt-3 max-w-md text-sm text-white/40">The installed application reads real Windows hardware information here.</p>
      </div>
    );
  }
  if (!hw) return <p className="text-micro text-white/30">Reading hardware</p>;

  const gpus = hw.gpus.filter((g) => g.name);
  const primaryGpu = gpus.find((g) => !/intel|amd radeon\(tm\) graphics/i.test(g.name ?? "")) ?? gpus[0];
  const fixed = hw.drives.filter((d) => d.kind === "fixed");
  const removable = hw.drives.filter((d) => d.kind !== "fixed");

  return (
    <div className="grid grid-cols-1 gap-x-20 gap-y-16 lg:grid-cols-2">
      <div className="space-y-16">
        {primaryGpu && (
          <Spec label="Graphics">
            {(() => { const [vendor, model] = splitVendor(primaryGpu.name!); return (
              <>
                {vendor && <p className="font-display text-[15px] tracking-wide3 text-white/45">{vendor}</p>}
                <p className="mt-1 font-display text-display-md font-semibold tracking-wide text-white">{model}</p>
              </>
            ); })()}
            <p className="mt-3 font-mono text-[13px] tabular text-white/50">{primaryGpu.vramTotalMb ? `${Math.round(primaryGpu.vramTotalMb / 1024)} GB` : "VRAM unknown"}{primaryGpu.driverVersion ? ` · driver ${primaryGpu.driverVersion}` : ""}</p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-micro">
              <Cap label="Utilization" ok={primaryGpu.utilizationSupported} /><Cap label="Temperature" ok={primaryGpu.temperatureSupported} /><Cap label="VRAM usage" ok={primaryGpu.memorySupported} />
            </div>
            {gpus.length > 1 && <p className="mt-4 text-[12px] text-white/35">Also present: {gpus.filter((g) => g !== primaryGpu).map((g) => g.name).join(", ")}</p>}
          </Spec>
        )}
        <Spec label="Processor">
          <p className="font-display text-display-md font-semibold tracking-wide text-white">{hw.cpuName.replace(/\s+\d+-Core Processor$/i, "").toUpperCase()}</p>
          <p className="mt-3 font-mono text-[13px] tabular text-white/50">{hw.physicalCores ?? "—"} cores · {hw.logicalCores} threads{snapshot ? ` · ${snapshot.cpu.usagePercent}% now` : ""}</p>
        </Spec>
        <Spec label="Memory">
          <p className="font-display text-display-md font-semibold tracking-wide text-white">{formatBytes(hw.totalMemoryBytes, 0)}</p>
          {snapshot && <p className="mt-3 font-mono text-[13px] tabular text-white/50">{formatBytes(snapshot.memory.usedBytes, 1)} in use · {snapshot.memory.usagePercent}%</p>}
        </Spec>
        <Spec label="Windows">
          <p className="text-[15px] text-white/85">{`${hw.osName} ${hw.osVersion}`.trim()}</p>
          <p className="mt-1 font-mono text-[12px] text-white/40">{hw.kernelVersion ? `build ${hw.kernelVersion} · ` : ""}{hw.arch} · {hw.hostname}</p>
        </Spec>
      </div>

      <div className="space-y-16">
        <Spec label={`Storage · ${fixed.length} fixed`}>
          <div className="divide-y divide-white/[0.05]">{fixed.map((d) => <Drive key={d.mountPoint} d={d} />)}</div>
        </Spec>
        <Spec label={`Removable · ${removable.length}`}>
          {removable.length === 0 ? <p className="text-sm text-white/30">None connected.</p> : <div className="divide-y divide-white/[0.05]">{removable.map((d) => <Drive key={d.mountPoint} d={d} removable />)}</div>}
          <p className="mt-4 max-w-md text-[12px] leading-relaxed text-white/30">Inventory only. Storage analysis and cleanup never inspect removable content; the media workspace reads only folders you authorize.</p>
        </Spec>
      </div>
    </div>
  );
}

function Spec({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="label mb-4">{label}</p>
      {children}
    </section>
  );
}
function Cap({ label, ok }: { label: string; ok: boolean }) {
  return <span className={ok ? "text-white/70" : "text-white/30"}>{label} · {ok ? "supported" : "unsupported"}</span>;
}
function Drive({ d, removable }: { d: { mountPoint: string; label: string; totalBytes: number; freeBytes: number; fileSystem: string | null }; removable?: boolean }) {
  const used = d.totalBytes - d.freeBytes;
  const pct = d.totalBytes ? (used / d.totalBytes) * 100 : 0;
  return (
    <div className="py-4">
      <div className="flex items-baseline justify-between">
        <span className="text-[15px] text-white/85">{d.mountPoint} <span className="text-white/40">{d.label}</span>{removable && <span className="ml-3 text-micro text-status-attention/70">removable</span>}</span>
        <span className="font-mono text-[12px] tabular text-white/45">{formatBytes(used, 0)} <span className="text-white/25">/ {formatBytes(d.totalBytes, 0)}</span>{d.fileSystem ? <span className="text-white/25"> · {d.fileSystem}</span> : null}</span>
      </div>
      <div className="mt-2.5 h-px bg-white/[0.08]"><div className={cn("h-full", pct > 88 ? "bg-status-warning" : "bg-white/70")} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
