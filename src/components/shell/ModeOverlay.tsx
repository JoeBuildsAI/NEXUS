import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Eye } from "lucide-react";
import { useModeStore } from "@/state/modeStore";
import { useSettingsStore } from "@/state/settingsStore";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

/** Full-screen transition overlay: "ENTERING GAMING MODE" + step statuses. */
export function ModeTransitionOverlay() {
  const transition = useModeStore((s) => s.transition);
  const configs = useModeStore((s) => s.configs);

  return (
    <AnimatePresence>
      {transition && (
        <motion.div
          className="fixed inset-0 z-[320] flex flex-col items-center justify-center bg-void-950/85 backdrop-blur-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.p
            className="text-xs uppercase tracking-cinematic text-accent/70"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {transition.target === "normal" ? "Restoring" : "Entering"}
          </motion.p>
          <motion.h1
            className="mt-3 font-display text-5xl font-bold tracking-[0.25em] text-white text-glow"
            initial={{ opacity: 0, letterSpacing: "0.5em" }}
            animate={{ opacity: 1, letterSpacing: "0.25em" }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          >
            {configs[transition.target].label.toUpperCase()} MODE
          </motion.h1>

          <div className="mt-12 w-full max-w-md space-y-2.5">
            {transition.steps.map((step, i) => {
              const done = i < transition.current || transition.done;
              const active = i === transition.current && !transition.done;
              const result = transition.results[step.id];
              return (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: done || active ? 1 : 0.35, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-3"
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                      done && result === "failed"
                        ? "border-status-critical/50 bg-status-critical/10 text-status-critical"
                        : done && (result === "unsupported" || result === "skipped" || result === "observed")
                          ? "border-white/15 text-white/40"
                          : done
                            ? "border-accent/50 bg-accent/15 text-accent"
                            : active
                              ? "border-white/30 text-white/70"
                              : "border-white/10 text-white/20",
                    )}
                  >
                    {done ? <Check size={13} /> : active ? <Loader2 size={13} className="animate-spin" /> : <span className="h-1 w-1 rounded-full bg-current" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm", done ? "text-white/85" : "text-white/60")}>{step.label}</p>
                    <p className="truncate text-xs text-white/35">{step.detail}</p>
                  </div>
                  {done && result && result !== "done" ? (
                    <span className={cn("flex items-center gap-1 text-[10px] uppercase tracking-wide2", result === "failed" ? "text-status-critical" : "text-white/30")}>
                      {result === "observed" && <Eye size={11} />} {result}
                    </span>
                  ) : !step.live ? (
                    <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide2 text-white/30"><Eye size={11} /> observe</span>
                  ) : null}
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Pre-activation preview: "Gaming Mode will:" with exact actions. */
export function ModePreviewDialog() {
  const preview = useModeStore((s) => s.preview);
  const cancel = useModeStore((s) => s.cancelPreview);
  const enterMode = useModeStore((s) => s.enterMode);
  const stepsFor = useModeStore((s) => s.stepsFor);
  const configs = useModeStore((s) => s.configs);
  const safety = useSettingsStore((s) => s.system.safety);

  const steps = preview ? stepsFor(preview) : [];

  return (
    <AnimatePresence>
      {preview && (
        <motion.div
          className="fixed inset-0 z-[210] flex items-center justify-center p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-void-950/70 backdrop-blur-sm" onClick={cancel} />
          <motion.div
            initial={{ scale: 0.95, y: 10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.97, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="glass-strong relative w-full max-w-lg overflow-hidden rounded-2xl p-7 shadow-panel"
          >
            <p className="text-[11px] uppercase tracking-cinematic text-accent/70">Mode preview</p>
            <h2 className="mt-2 font-display text-2xl font-semibold tracking-wide2 text-white">
              {configs[preview].label} Mode will:
            </h2>
            <p className="mt-1 text-sm text-white/45">{configs[preview].description}</p>

            <ul className="mt-6 space-y-3">
              {steps.map((s) => (
                <li key={s.id} className="flex items-start gap-3">
                  <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", s.live ? "bg-accent" : "bg-white/30")} />
                  <div>
                    <p className="text-sm text-white/85">{s.label}</p>
                    <p className="text-xs text-white/40">{s.detail}</p>
                  </div>
                </li>
              ))}
            </ul>

            {safety === "observe" && (
              <p className="mt-5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-white/45">
                System safety is <span className="text-white/75">observe-only</span>. Steps marked observe are recorded but not
                applied. Change this in Settings → System.
              </p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={cancel}>Cancel</Button>
              <Button variant="primary" onClick={() => void enterMode(preview)}>
                Enter {configs[preview].label} Mode
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
