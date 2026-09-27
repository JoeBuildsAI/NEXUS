import { cn } from "@/lib/utils";

interface ProgressRingProps {
  /** 0-100 */
  value: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  className?: string;
  color?: string;
}

/** Circular progress gauge used for CPU/GPU/RAM telemetry. */
export function ProgressRing({
  value,
  size = 96,
  strokeWidth = 6,
  label,
  sublabel,
  className,
  color = "#5ed0e6",
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)",
            filter: `drop-shadow(0 0 6px ${color}55)`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-lg font-semibold tabular-nums text-white/90">
          {Math.round(clamped)}
          <span className="text-xs text-white/40">%</span>
        </span>
        {label && (
          <span className="text-[10px] uppercase tracking-wide2 text-white/40">
            {label}
          </span>
        )}
        {sublabel && <span className="text-[9px] text-white/30">{sublabel}</span>}
      </div>
    </div>
  );
}
