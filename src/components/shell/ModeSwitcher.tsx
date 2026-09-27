import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import type { OperatingMode } from "@/core/types";
import { useModeStore } from "@/state/modeStore";
import { cn } from "@/lib/utils";

const ORDER: OperatingMode[] = ["normal", "gaming", "media", "work", "focus"];

/** Quiet operating-mode selector — text, a chevron, a typographic menu. */
export function ModeSwitcher() {
  const current = useModeStore((s) => s.current);
  const configs = useModeStore((s) => s.configs);
  const requestMode = useModeStore((s) => s.requestMode);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "no-drag flex items-center gap-2 rounded-md px-3 py-2 text-[13px] tracking-wide transition-colors",
          current === "normal" ? "text-white/60 hover:bg-white/[0.05] hover:text-white" : "bg-white/[0.07] text-white",
        )}
      >
        <span className="text-micro tracking-wide3">{configs[current].label} mode</span>
        <ChevronDown size={13} className={cn("text-white/40 transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              role="menu"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.14 }}
              className="glass-strong absolute right-0 z-20 mt-2 w-52 rounded-md py-1.5"
            >
              {ORDER.map((mode) => {
                const active = mode === current;
                return (
                  <button
                    key={mode}
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => { requestMode(mode); setOpen(false); }}
                    className={cn("flex w-full items-center justify-between px-3.5 py-2 text-left text-[13.5px] transition-colors", active ? "text-white" : "text-white/55 hover:bg-white/[0.05] hover:text-white")}
                  >
                    {configs[mode].label}
                    {active && <span className="h-1 w-1 rounded-full bg-white" />}
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
