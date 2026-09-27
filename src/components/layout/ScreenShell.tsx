import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ScreenShellProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Consistent scrollable screen container with a cinematic header. */
export function ScreenShell({
  title,
  subtitle,
  actions,
  children,
  className,
}: ScreenShellProps) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-end justify-between px-8 pt-7 pb-5">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-wide2 text-white/95">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm text-white/40">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>
      <div className={cn("min-h-0 flex-1 overflow-y-auto px-8 pb-8", className)}>
        {children}
      </div>
    </div>
  );
}
