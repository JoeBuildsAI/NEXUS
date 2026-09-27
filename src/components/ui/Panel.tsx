import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds a stronger glass treatment for elevated surfaces. */
  strong?: boolean;
  /** Subtle top accent hairline for headers. */
  glow?: boolean;
}

/** Core glass surface primitive. */
export const Panel = forwardRef<HTMLDivElement, PanelProps>(
  ({ className, strong, glow, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        strong ? "glass-strong" : "glass",
        "rounded-2xl",
        glow && "shadow-glow",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);
Panel.displayName = "Panel";

interface PanelHeaderProps {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function PanelHeader({ title, icon, action, className }: PanelHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between px-5 pt-4 pb-3", className)}>
      <div className="flex items-center gap-2.5">
        {icon && <span className="text-accent/80">{icon}</span>}
        <h3 className="text-[11px] font-medium uppercase tracking-wide2 text-white/50">
          {title}
        </h3>
      </div>
      {action}
    </div>
  );
}
