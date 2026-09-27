import { useId } from "react";

interface SparklineProps {
  data: readonly number[];
  width?: number;
  height?: number;
  color?: string;
  /** Max value for scaling; defaults to 100. */
  max?: number;
  className?: string;
}

/** Lightweight SVG sparkline for telemetry history. */
export function Sparkline({
  data,
  width = 120,
  height = 36,
  color = "#5ed0e6",
  max = 100,
  className,
}: SparklineProps) {
  const gradientId = useId();
  if (data.length < 2) {
    return <svg width={width} height={height} className={className} />;
  }

  const step = width / (data.length - 1);
  const points = data.map((v, i) => {
    const x = i * step;
    const y = height - (Math.max(0, Math.min(max, v)) / max) * height;
    return [x, y] as const;
  });

  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;

  return (
    <svg width={width} height={height} className={className} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
