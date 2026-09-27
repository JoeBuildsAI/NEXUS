import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSettingsStore } from "@/state/settingsStore";

const USER_NAME = "JOSEPH";

const STEPS = [
  "INITIALIZING NEXUS",
  "CALIBRATING TELEMETRY",
  "LOADING ENVIRONMENT",
];

interface BootSequenceProps {
  onComplete: () => void;
}

/**
 * Cinematic boot sequence: mark reveal → initialization steps → personalized
 * welcome → hand off to Home. Skippable via click / any key / Enter. Respects
 * the "startup animation" setting and reduced motion (short-circuits instantly).
 */
export function BootSequence({ onComplete }: BootSequenceProps) {
  const startupAnimation = useSettingsStore((s) => s.startup.startupAnimation);
  const reducedMotion = useSettingsStore((s) => s.appearance.reducedMotion);
  const userName = useSettingsStore((s) => s.profile.name) || USER_NAME;
  const [phase, setPhase] = useState<"init" | "welcome" | "done">("init");
  const [stepIndex, setStepIndex] = useState(0);

  const skip = () => {
    setPhase("done");
    onComplete();
  };

  useEffect(() => {
    if (!startupAnimation || reducedMotion) {
      skip();
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    STEPS.forEach((_, i) => {
      timers.push(setTimeout(() => setStepIndex(i), 500 + i * 550));
    });
    timers.push(setTimeout(() => setPhase("welcome"), 500 + STEPS.length * 550));
    timers.push(setTimeout(() => skip(), 500 + STEPS.length * 550 + 1600));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") skip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "done") return null;

  return (
    <motion.div
      className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-void-950"
      onClick={skip}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      <AnimatePresence mode="wait">
        {phase === "init" ? (
          <motion.div
            key="init"
            className="flex flex-col items-center"
            exit={{ opacity: 0, scale: 0.98 }}
          >
            <NexusMark />
            <div className="mt-10 h-6">
              <AnimatePresence mode="wait">
                <motion.p
                  key={stepIndex}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.3 }}
                  className="font-mono text-xs uppercase tracking-cinematic text-accent/70"
                >
                  {STEPS[stepIndex]}
                </motion.p>
              </AnimatePresence>
            </div>
            <div className="mt-4 h-px w-56 overflow-hidden bg-white/10">
              <motion.div
                className="h-full bg-accent"
                initial={{ width: "0%" }}
                animate={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="welcome"
            className="flex flex-col items-center"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <motion.p
              className="text-xs uppercase tracking-cinematic text-white/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              Welcome
            </motion.p>
            <motion.h1
              className="mt-3 font-display text-5xl font-bold tracking-[0.2em] text-white"
              initial={{ opacity: 0, letterSpacing: "0.5em" }}
              animate={{ opacity: 1, letterSpacing: "0.2em" }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              style={{ textShadow: "0 0 40px rgba(94,208,230,0.4)" }}
            >
              {userName.toUpperCase()}
            </motion.h1>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="absolute bottom-8 text-[10px] uppercase tracking-wide2 text-white/25">
        Click or press any key to continue
      </p>
    </motion.div>
  );
}

function NexusMark() {
  return (
    <motion.div
      className="relative flex h-28 w-28 items-center justify-center"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    >
      <motion.div
        className="absolute inset-0 rounded-full border border-accent/30"
        animate={{ rotate: 360 }}
        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute inset-3 rounded-full border border-accent/20"
        animate={{ rotate: -360 }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
      />
      <div
        className="absolute inset-8 rounded-full bg-accent/10 blur-md"
        style={{ boxShadow: "0 0 40px rgba(94,208,230,0.5)" }}
      />
      <span className="relative font-display text-3xl font-bold tracking-widest text-white">
        N
      </span>
    </motion.div>
  );
}
