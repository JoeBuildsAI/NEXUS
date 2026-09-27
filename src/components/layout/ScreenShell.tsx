import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ScreenShellProps {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Constrain content width on very large displays. */
  wide?: boolean;
}

/** Consistent scrollable screen container with a cinematic header. */
export function ScreenShell({ title, eyebrow, subtitle, actions, children, className, wide }: ScreenShellProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn("mx-auto px-10 pb-12 pt-8 2xl:px-14", wide ? "max-w-[1800px]" : "max-w-[1500px]")}>
          <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              {eyebrow && <p className="text-[11px] uppercase tracking-cinematic text-accent/70">{eyebrow}</p>}
              <h1 className="mt-1 font-display text-[2rem] font-semibold leading-none tracking-wide2 text-white/95">{title}</h1>
              {subtitle && <p className="mt-2 text-sm text-white/40">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </header>
          <div className={className}>{children}</div>
        </div>
      </div>
    </div>
  );
}
