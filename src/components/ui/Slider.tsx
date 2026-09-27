import { cn } from "@/lib/utils";

interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  valueLabel?: string;
  className?: string;
}

export function Slider({ value, onChange, min = 0, max = 100, step = 1, label, valueLabel, className }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={cn("space-y-2", className)}>
      {(label || valueLabel) && (
        <div className="flex items-center justify-between">
          {label && <span className="text-sm text-white/75">{label}</span>}
          <span className="font-mono text-xs tabular text-white/45">{valueLabel ?? value}</span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="no-drag h-px w-full cursor-pointer appearance-none rounded-full outline-none
          [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_rgba(0,0,0,1)]
          [&::-webkit-slider-thumb]:transition-transform hover:[&::-webkit-slider-thumb]:scale-125
          focus-visible:[&::-webkit-slider-thumb]:ring-1 focus-visible:[&::-webkit-slider-thumb]:ring-white/60"
        style={{ background: `linear-gradient(90deg, rgba(255,255,255,0.85) ${pct}%, rgba(255,255,255,0.12) ${pct}%)` }}
      />
    </div>
  );
}
