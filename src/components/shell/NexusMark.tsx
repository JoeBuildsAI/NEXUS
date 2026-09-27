import { cn } from "@/lib/utils";

/**
 * The NEXUS mark: two vertical stems joined by a single diagonal — an "N"
 * reduced to three strokes. Monochrome, geometric, legible from 16px up.
 * Mirrors the generated application icon (scripts/gen-icon.mjs).
 */
export function NexusMark({ size = 24, className, strokeWidth = 2.2 }: { size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cn("shrink-0", className)} aria-hidden="true">
      <path d="M5 20V4" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M19 20V4" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M5 4L19 20" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeOpacity={0.55} />
    </svg>
  );
}
