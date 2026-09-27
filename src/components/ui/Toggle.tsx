import { cn } from "@/lib/utils";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
}: ToggleProps) {
  return (
    <label
      className={cn(
        "flex items-center justify-between gap-4",
        disabled && "opacity-50",
        className,
      )}
    >
      {(label || description) && (
        <span className="flex flex-col">
          {label && <span className="text-sm text-white/85">{label}</span>}
          {description && (
            <span className="text-xs text-white/40">{description}</span>
          )}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "no-drag relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60",
          checked
            ? "border-accent/40 bg-accent/30"
            : "border-white/12 bg-white/[0.05]",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4.5 w-4.5 rounded-full transition-all duration-200",
            "h-[18px] w-[18px]",
            checked ? "left-[22px] bg-accent shadow-glow-sm" : "left-0.5 bg-white/60",
          )}
        />
      </button>
    </label>
  );
}
