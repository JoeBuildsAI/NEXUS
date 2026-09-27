import { motion } from "framer-motion";
import { NexusStatus } from "./NexusStatus";
import { TelemetryWave } from "./TelemetryWave";
import { ActivityStrip } from "./ActivityStrip";
import {
  CommsSurface,
  ContinuePlaying,
  InsightsSurface,
  MediaSurface,
  StorageSurface,
} from "./HomeSurfaces";
import { ModeSwitcher } from "@/components/shell/ModeSwitcher";
import { ErrorBoundary } from "@/components/ui";
import { useClock, formatDateLong, formatTime, greeting } from "@/hooks/useClock";
import { useSettingsStore } from "@/state/settingsStore";

const stagger = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.05 } } };
const rise = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } } };

/**
 * Home / command center. Information is embedded into the environment with
 * strong hierarchy: identity + time → NEXUS status → live telemetry → context.
 */
export function HomeScreen() {
  const now = useClock();
  const name = useSettingsStore((s) => s.profile.name) || "Joseph";

  return (
    <div className="h-full overflow-y-auto">
      <motion.div variants={stagger} initial="hidden" animate="show" className="mx-auto flex min-h-full max-w-[1500px] flex-col px-10 pb-10 pt-8 2xl:max-w-[1700px] 2xl:px-14 2xl:pt-12">
        {/* Identity row */}
        <motion.header variants={rise} className="flex items-start justify-between gap-8">
          <div>
            <p className="text-[11px] uppercase tracking-cinematic text-accent/70">{greeting(now)}</p>
            <h1 className="mt-2 font-display text-[clamp(2.4rem,4vw,4rem)] font-bold leading-none tracking-wide2 text-white text-glow">
              WELCOME, {name.toUpperCase()}
            </h1>
            <p className="mt-3 text-sm text-white/40">{formatDateLong(now)}</p>
          </div>
          <div className="flex flex-col items-end gap-4">
            <p className="font-mono text-[clamp(2.5rem,4.5vw,4.5rem)] font-light leading-none tabular-nums tracking-tight text-white/90">
              {formatTime(now)}
            </p>
            <ModeSwitcher />
          </div>
        </motion.header>

        {/* Status + wave */}
        <motion.section variants={rise} className="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-[minmax(380px,32%)_1fr]">
          <NexusStatus />
          <div className="flex flex-col justify-end">
            <TelemetryWave height={150} />
            <div className="hairline-t mt-4" />
            <div className="mt-3">
              <ActivityStrip />
            </div>
          </div>
        </motion.section>

        {/* Context */}
        <motion.section variants={rise} className="mt-14 grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-10">
            <ErrorBoundary inline label="Continue playing"><ContinuePlaying /></ErrorBoundary>
            <ErrorBoundary inline label="Suggestions"><InsightsSurface /></ErrorBoundary>
          </div>
          <div className="space-y-10 lg:border-l lg:border-white/[0.05] lg:pl-12">
            <ErrorBoundary inline label="Communications"><CommsSurface /></ErrorBoundary>
            <ErrorBoundary inline label="Storage"><StorageSurface /></ErrorBoundary>
            <ErrorBoundary inline label="Media"><MediaSurface /></ErrorBoundary>
          </div>
        </motion.section>
      </motion.div>
    </div>
  );
}
