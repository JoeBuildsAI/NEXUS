import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "accent" | "nominal" | "attention" | "warning" | "critical";

/** Quiet status chips. Monochrome by default; color only for real states. */
const tones: Record<Tone, string> = {
  neutral: "text-white/55 bg-white/[0.05]",
  accent: "text-white/85 bg-white/[0.09]",
  nominal: "text-status-nominal/90 bg-status-nominal/[0.08]",
  attention: "text-status-attention/90 bg-status-attention/[0.09]",
  warning: "text-status-warning/90 bg-status-warning/[0.09]",
  critical: "text-status-critical/90 bg-status-critical/[0.1]",
};

export function Badge({
  children,
  tone = "neutral",
  className,
  dot,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-1.5 py-[3px] text-[10.5px] font-medium uppercase tracking-wide2 leading-none",
        tones[tone],
        className,
      )}
    >
      {dot && <span className="h-1 w-1 rounded-full bg-current" />}
      {children}
    </span>
  );
}
