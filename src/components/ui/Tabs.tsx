import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
}

interface TabsProps<T extends string> {
  tabs: readonly TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  layoutId?: string;
  className?: string;
}

/** Underline tabs — typography and a single moving hairline, no boxes. */
export function Tabs<T extends string>({ tabs, value, onChange, layoutId = "tabs-active", className }: TabsProps<T>) {
  return (
    <div className={cn("inline-flex items-end gap-6", className)} role="tablist">
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative flex items-center gap-1.5 pb-2 text-[13px] tracking-wide transition-colors duration-200",
              active ? "text-white" : "text-white/40 hover:text-white/75",
            )}
          >
            {tab.icon && <span className="opacity-70">{tab.icon}</span>}
            {tab.label}
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-x-0 -bottom-px h-px bg-white"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
