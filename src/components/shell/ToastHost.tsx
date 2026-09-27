import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, Info, X, Zap } from "lucide-react";
import { useToastStore, type ToastTone } from "@/state/toastStore";
import { cn } from "@/lib/utils";

const TONE: Record<ToastTone, { bar: string; icon: React.ReactNode }> = {
  neutral: { bar: "bg-white/40", icon: <Info size={14} /> },
  accent: { bar: "bg-accent", icon: <Zap size={14} /> },
  success: { bar: "bg-status-nominal", icon: <Check size={14} /> },
  warning: { bar: "bg-status-attention", icon: <AlertTriangle size={14} /> },
  critical: { bar: "bg-status-critical", icon: <AlertTriangle size={14} /> },
};

/** Unified notification host. Mounted once at the app root. */
export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[350] flex w-[360px] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const tone = TONE[t.tone];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="pointer-events-auto glass-strong relative overflow-hidden rounded-xl shadow-panel"
            >
              <div className={cn("absolute inset-y-0 left-0 w-[3px]", tone.bar)} />
              <div className="flex items-start gap-3 py-3 pl-4 pr-3">
                <span className="mt-0.5 text-white/60">{tone.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white/90">{t.title}</p>
                  {t.description && (
                    <p className="mt-0.5 text-xs leading-relaxed text-white/45">{t.description}</p>
                  )}
                </div>
                <button
                  onClick={() => dismiss(t.id)}
                  className="text-white/30 transition-colors hover:text-white"
                  aria-label="Dismiss"
                >
                  <X size={14} />
                </button>
              </div>
              {t.durationMs > 0 && (
                <motion.div
                  className={cn("absolute bottom-0 left-0 h-px opacity-50", tone.bar)}
                  initial={{ width: "100%" }}
                  animate={{ width: "0%" }}
                  transition={{ duration: t.durationMs / 1000, ease: "linear" }}
                />
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
