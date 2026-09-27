import { Gamepad2, Briefcase, Play, Target, Home, ChevronDown } from "lucide-react";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { OperatingMode } from "@/core/types";
import { useModeStore } from "@/state/modeStore";
import { cn } from "@/lib/utils";

const MODE_META: Record<OperatingMode, { label: string; icon: typeof Home }> = {
  normal: { label: "Normal", icon: Home },
  gaming: { label: "Gaming", icon: Gamepad2 },
  media: { label: "Media", icon: Play },
  work: { label: "Work", icon: Briefcase },
  focus: { label: "Focus", icon: Target },
};

const ORDER: OperatingMode[] = ["normal", "gaming", "media", "work", "focus"];

/** Compact operating-mode selector. */
export function ModeSwitcher() {
  const current = useModeStore((s) => s.current);
  const enterMode = useModeStore((s) => s.enterMode);
  const [open, setOpen] = useState(false);
  const Current = MODE_META[current].icon;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "no-drag flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors",
          current === "normal"
            ? "border-white/10 bg-white/[0.03] text-white/70"
            : "border-accent/30 bg-accent/[0.08] text-accent shadow-glow-sm",
        )}
      >
        <Current size={15} />
        <span className="font-medium">{MODE_META[current].label} Mode</span>
        <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="glass-strong absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-xl p-1.5 shadow-panel"
            >
              {ORDER.map((mode) => {
                const Icon = MODE_META[mode].icon;
                const active = mode === current;
                return (
                  <button
                    key={mode}
                    onClick={() => {
                      enterMode(mode);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-accent/15 text-accent"
                        : "text-white/70 hover:bg-white/[0.05]",
                    )}
                  >
                    <Icon size={15} />
                    {MODE_META[mode].label}
                  </button>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
