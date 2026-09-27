import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "accent" | "nominal" | "attention" | "warning" | "critical";

const tones: Record<Tone, string> = {
  neutral: "bg-white/[0.06] text-white/60 border-white/10",
  accent: "bg-accent/10 text-accent border-accent/25",
  nominal: "bg-status-nominal/10 text-status-nominal border-status-nominal/25",
  attention: "bg-status-attention/10 text-status-attention border-status-attention/25",
  warning: "bg-status-warning/10 text-status-warning border-status-warning/25",
  critical: "bg-status-critical/10 text-status-critical border-status-critical/25",
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
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
