import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSettingsStore } from "@/state/settingsStore";
import { NexusMark } from "./NexusMark";

interface BootSequenceProps {
  onComplete: () => void;
}

/**
 * Boot: black → tiny mark → INITIALIZING with faint data movement → NEXUS →
 * WELCOME, <name> → environment. ~2.6s total, skippable, honors reduced motion.
 */
export function BootSequence({ onComplete }: BootSequenceProps) {
  const startupAnimation = useSettingsStore((s) => s.startup.startupAnimation);
  const reducedMotion = useSettingsStore((s) => s.appearance.reducedMotion);
  const userName = (useSettingsStore((s) => s.profile.name) || "Joseph").toUpperCase();
  const [phase, setPhase] = useState<"mark" | "init" | "nexus" | "welcome" | "done">("mark");

  const skip = () => {
    setPhase("done");
    onComplete();
  };

  useEffect(() => {
    if (!startupAnimation || reducedMotion) {
      skip();
      return;
    }
    const t = [
      setTimeout(() => setPhase("init"), 500),
      setTimeout(() => setPhase("nexus"), 1500),
      setTimeout(() => setPhase("welcome"), 2150),
      setTimeout(() => skip(), 3200),
    ];
    return () => t.forEach(clearTimeout);
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
    <motion.div className="fixed inset-0 z-[300] flex items-center justify-center bg-black" onClick={skip} exit={{ opacity: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
      <AnimatePresence mode="wait">
        {(phase === "mark" || phase === "init") && (
          <motion.div key="mark" className="flex flex-col items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
            <NexusMark size={22} className="text-white/80" strokeWidth={1.8} />
            <div className="mt-8 h-4">
              <AnimatePresence>
                {phase === "init" && (
                  <motion.p key="init" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-micro tracking-cinematic text-white/40">
                    Initializing
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
            <DataMovement active={phase === "init"} />
          </motion.div>
        )}

        {phase === "nexus" && (
          <motion.h1 key="nexus" initial={{ opacity: 0, letterSpacing: "0.6em" }} animate={{ opacity: 1, letterSpacing: "0.42em" }} exit={{ opacity: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="font-display text-2xl font-semibold text-white">
            NEXUS
          </motion.h1>
        )}

        {phase === "welcome" && (
          <motion.div key="welcome" className="text-center" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
            <p className="text-micro tracking-cinematic text-white/35">Welcome</p>
            <p className="mt-3 font-display text-display-md font-semibold tracking-wide2 text-white text-glow">{userName}</p>
          </motion.div>
        )}
      </AnimatePresence>
      <p className="absolute bottom-8 text-micro text-white/20">press any key</p>
    </motion.div>
  );
}

/** Faint horizontal data lines that build in from the left — telemetry waking up. */
function DataMovement({ active }: { active: boolean }) {
  return (
    <div className="mt-6 flex w-40 flex-col gap-[6px]">
      {[0.8, 0.55, 0.7, 0.4].map((w, i) => (
        <motion.span
          key={i}
          className="h-px origin-left bg-white/25"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={active ? { scaleX: w, opacity: [0, 1, 0.5] } : { scaleX: 0, opacity: 0 }}
          transition={{ duration: 0.9, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
    </div>
  );
}
