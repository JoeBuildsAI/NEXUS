import { useId } from "react";
import { cn } from "@/lib/utils";

interface LiveChartProps {
  data: readonly number[];
  /** Number of points the chart represents (pads from the right). */
  capacity?: number;
  max?: number;
  color?: string;
  height?: number;
  label?: string;
  value?: string;
  sublabel?: string;
  unavailable?: boolean;
  className?: string;
}

/** Compact live history chart with header. Pads from the right so new data scrolls in. */
export function LiveChart({
  data,
  capacity = 60,
  max = 100,
  color = "#5ed0e6",
  height = 72,
  label,
  value,
  sublabel,
  unavailable,
  className,
}: LiveChartProps) {
  const id = useId();
  const W = 300;
  const pts = data.slice(-capacity);
  const offset = capacity - pts.length;
  const step = W / (capacity - 1);
  const coords = pts.map((v, i) => [(i + offset) * step, height - (Math.min(max, Math.max(0, v)) / max) * (height - 6) - 3] as const);
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = coords.length ? `${line} L${W},${height} L${coords[0]![0]},${height} Z` : "";

  return (
    <div className={cn("min-w-0", className)}>
      {(label || value) && (
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-wide2 text-white/40">{label}</span>
          <span className={cn("font-mono text-sm tabular-nums", unavailable ? "text-white/30" : "text-white/85")}>{unavailable ? "N/A" : value}</span>
        </div>
      )}
      <div className="relative" style={{ height }}>
        {unavailable ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-white/[0.06] text-[11px] text-white/25">
            Unavailable on this machine
          </div>
        ) : (
          <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="h-full w-full">
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={f} x1="0" x2={W} y1={height * f} y2={height * f} stroke="rgba(255,255,255,0.04)" />
            ))}
            {coords.length > 1 && (
              <>
                <path d={area} fill={`url(#${id})`} />
                <path d={line} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 4px ${color}88)` }} />
              </>
            )}
          </svg>
        )}
      </div>
      {sublabel && <p className="mt-1.5 truncate text-[11px] text-white/35">{sublabel}</p>}
    </div>
  );
}
