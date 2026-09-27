import { cn } from "@/lib/utils";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

/** Monochrome switch: white pill when on, smoke track when off. */
export function Toggle({ checked, onChange, label, description, disabled, className }: ToggleProps) {
  return (
    <label className={cn("flex items-center justify-between gap-4", disabled && "opacity-40", className)}>
      {(label || description) && (
        <span className="flex flex-col">
          {label && <span className="text-sm text-white/85">{label}</span>}
          {description && <span className="text-xs text-white/40">{description}</span>}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "no-drag relative h-[22px] w-10 shrink-0 rounded-full transition-colors duration-200 ease-nexus",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
          checked ? "bg-white" : "bg-white/[0.12] hover:bg-white/[0.18]",
        )}
      >
        <span
          className={cn(
            "absolute top-[3px] h-4 w-4 rounded-full transition-[left,background-color] duration-200 ease-nexus",
            checked ? "left-[21px] bg-black" : "left-[3px] bg-white/70",
          )}
        />
      </button>
    </label>
  );
}
