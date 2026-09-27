import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { Panel } from "@/components/ui";
import { cn } from "@/lib/utils";

interface QuickCardProps {
  title: string;
  icon: ReactNode;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  accent?: string;
}

/** Interactive summary card used on the Home command center. */
export function QuickCard({
  title,
  icon,
  onClick,
  children,
  className,
  accent = "#5ed0e6",
}: QuickCardProps) {
  return (
    <Panel
      onClick={onClick}
      className={cn(
        "group relative cursor-pointer overflow-hidden p-5 transition-all duration-300",
        "hover:border-white/15 hover:shadow-glow-sm",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: accent }}
      />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span style={{ color: accent }}>{icon}</span>
          <h3 className="text-[11px] font-medium uppercase tracking-wide2 text-white/50">
            {title}
          </h3>
        </div>
        <ArrowUpRight
          size={15}
          className="text-white/20 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white/50"
        />
      </div>
      <div className="relative mt-4">{children}</div>
    </Panel>
  );
}
