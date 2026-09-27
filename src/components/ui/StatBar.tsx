import { cn } from "@/lib/utils";

interface StatBarProps {
  label: string;
  /** 0-100 */
  value: number;
  valueLabel?: string;
  color?: string;
  className?: string;
}

/** Horizontal telemetry bar with label and value. */
export function StatBar({
  label,
  value,
  valueLabel,
  color = "#5ed0e6",
  className,
}: StatBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-wide2 text-white/45">
          {label}
        </span>
        <span className="font-mono text-xs tabular-nums text-white/70">
          {valueLabel ?? `${Math.round(clamped)}%`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full"
          style={{
            width: `${clamped}%`,
            background: `linear-gradient(90deg, ${color}88, ${color})`,
            boxShadow: `0 0 8px ${color}66`,
            transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
          }}
        />
      </div>
    </div>
  );
}
