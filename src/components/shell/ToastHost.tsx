import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useToastStore, type ToastTone } from "@/state/toastStore";
import { cn } from "@/lib/utils";

const TONE_DOT: Record<ToastTone, string> = {
  neutral: "bg-white/40",
  accent: "bg-white",
  success: "bg-status-nominal",
  warning: "bg-status-attention",
  critical: "bg-status-critical",
};

/** Minimal notifications: a dot, small-caps title, optional line of detail. */
export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-7 right-8 z-[350] flex w-[340px] flex-col items-end gap-2" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ type: "spring", stiffness: 500, damping: 38 }}
            className="pointer-events-auto glass-strong flex max-w-full items-start gap-3 rounded-md py-2.5 pl-3.5 pr-2.5"
          >
            <span className={cn("mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full", TONE_DOT[t.tone])} />
            <div className="min-w-0 flex-1">
              <p className="text-micro tracking-wide3 text-white/85">{t.title}</p>
              {t.description && <p className="mt-1 text-[12.5px] leading-snug text-white/45">{t.description}</p>}
            </div>
            <button onClick={() => dismiss(t.id)} className="mt-px text-white/25 transition-colors hover:text-white" aria-label="Dismiss">
              <X size={13} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
