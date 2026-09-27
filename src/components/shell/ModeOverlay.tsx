import { AnimatePresence, motion } from "framer-motion";
import { useModeStore, type StepResult } from "@/state/modeStore";
import { useSettingsStore } from "@/state/settingsStore";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

const RESULT_TEXT: Record<StepResult, string> = {
  done: "APPLIED",
  observed: "RECORDED",
  unsupported: "UNSUPPORTED",
  failed: "FAILED",
  skipped: "—",
};

/**
 * Mode transition: the environment darkens, a centered wordmark states the new
 * mode, and a quiet two-column ledger reports each action. Not a modal.
 */
export function ModeTransitionOverlay() {
  const transition = useModeStore((s) => s.transition);
  const configs = useModeStore((s) => s.configs);

  return (
    <AnimatePresence>
      {transition && (
        <motion.div
          className="fixed inset-0 z-[320] flex flex-col items-center justify-center bg-black/80 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          aria-live="polite"
        >
          <motion.h1
            className="font-display text-display-lg font-semibold uppercase tracking-cinematic text-white"
            initial={{ opacity: 0, letterSpacing: "0.5em" }}
            animate={{ opacity: 1, letterSpacing: "0.32em" }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            {configs[transition.target].label} Mode
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-3 text-micro tracking-cinematic text-white/35">
            {transition.done ? "Environment ready" : transition.target === "normal" ? "Restoring environment" : "Optimizing environment"}
          </motion.p>

          <div className="mt-12 w-full max-w-md">
            {transition.steps.filter((s) => s.kind !== "note" || transition.results[s.id] === "failed").map((step, i) => {
              const idx = transition.steps.indexOf(step);
              const done = idx < transition.current || transition.done;
              const active = idx === transition.current && !transition.done;
              const result = transition.results[step.id];
              return (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: done || active ? 1 : 0.3, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-baseline justify-between gap-6 py-2"
                >
                  <span className={cn("text-[13.5px] tracking-wide", done ? "text-white/75" : "text-white/45")}>{step.label}</span>
                  <span
                    className={cn(
                      "font-mono text-[11px] tracking-wide2",
                      !done && active && "text-white/40",
                      done && (result === "done" ? "text-white" : result === "failed" ? "text-status-critical" : "text-white/35"),
                    )}
                  >
                    {done ? RESULT_TEXT[result ?? "done"] : active ? "···" : ""}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Pre-activation preview: exactly what Gaming Mode will do. */
export function ModePreviewDialog() {
  const preview = useModeStore((s) => s.preview);
  const cancel = useModeStore((s) => s.cancelPreview);
  const enterMode = useModeStore((s) => s.enterMode);
  const stepsFor = useModeStore((s) => s.stepsFor);
  const configs = useModeStore((s) => s.configs);
  const safety = useSettingsStore((s) => s.system.safety);
  const steps = preview ? stepsFor(preview).filter((s) => s.kind !== "note" || s.id === "apps-none") : [];

  return (
    <AnimatePresence>
      {preview && (
        <motion.div className="fixed inset-0 z-[210] flex items-center justify-center p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/85 backdrop-blur-xl" onClick={cancel} />
          <motion.div
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 6, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="relative w-full max-w-lg"
            role="dialog"
            aria-label={`${configs[preview].label} Mode preview`}
          >
            <p className="text-micro tracking-cinematic text-white/35">Entering</p>
            <h2 className="mt-2 font-display text-display-md font-semibold uppercase tracking-wide3 text-white">{configs[preview].label} Mode</h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-white/45">{configs[preview].description}</p>

            <div className="mt-8 divide-y divide-white/[0.06]">
              {steps.map((s) => (
                <div key={s.id} className="flex items-baseline justify-between gap-6 py-3">
                  <div className="min-w-0">
                    <p className="text-[14px] text-white/85">{s.label}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-white/40">{s.detail}</p>
                  </div>
                  <span className={cn("shrink-0 font-mono text-[11px] tracking-wide2", s.live ? "text-white/70" : "text-white/30")}>{s.live ? "WILL APPLY" : "RECORD ONLY"}</span>
                </div>
              ))}
            </div>

            {safety === "observe" && (
              <p className="mt-5 text-xs leading-relaxed text-white/40">
                System safety is <span className="text-white/70">observe-only</span>: nothing outside NEXUS is modified. Change this in Settings → System.
              </p>
            )}

            <div className="mt-8 flex justify-end gap-2">
              <Button variant="ghost" onClick={cancel}>Cancel</Button>
              <Button variant="primary" onClick={() => void enterMode(preview)}>Enter {configs[preview].label} Mode</Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
