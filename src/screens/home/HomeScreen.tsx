import { motion } from "framer-motion";
import { InstrumentLedger } from "./InstrumentLedger";
import { TelemetryWave } from "./TelemetryWave";
import { CommsSurface, ContinuePlaying, InsightsSurface, StorageSurface } from "./HomeSurfaces";
import { RecentActivity } from "./RecentActivity";
import { ModeSwitcher } from "@/components/shell/ModeSwitcher";
import { ErrorBoundary } from "@/components/ui";
import { useClock, greeting } from "@/hooks/useClock";
import { useSettingsStore } from "@/state/settingsStore";
import { useTelemetryStore } from "@/state/telemetryStore";
import { HEALTH_META } from "@/core/safety/health";
import { cn } from "@/lib/utils";

const stagger = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.05 } } };
const rise = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } } };

const TONE_TEXT = {
  nominal: "text-white/85",
  attention: "text-status-attention",
  warning: "text-status-warning",
  critical: "text-status-critical",
} as const;

/**
 * Home. Black environment; hierarchy from type, scale and light.
 *   WELCOME, JOSEPH             19:42
 *   NEXUS · SYSTEM NOMINAL      SATURDAY · SEPTEMBER 26
 *   instrumentation ─────────── telemetry wave
 *   continue playing (artwork)  communications / storage
 *   NEXUS suggestions
 */
export function HomeScreen() {
  const now = useClock();
  const name = useSettingsStore((s) => s.profile.name) || "Joseph";
  const subtitle = useSettingsStore((s) => s.profile.subtitle);
  const clockFormat = useSettingsStore((s) => s.profile.clockFormat);
  const health = useTelemetryStore((s) => s.snapshot?.health);
  const meta = health ? HEALTH_META[health] : null;

  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: clockFormat === "12h" }).replace(/s?[AP]M$/i, "");
  const meridiem = clockFormat === "12h" ? (now.getHours() >= 12 ? "PM" : "AM") : null;
  const date = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }).toUpperCase().replace(",", " ·");

  return (
    <div className="h-full overflow-y-auto">
      <motion.div variants={stagger} initial="hidden" animate="show" className="mx-auto flex min-h-full max-w-[1560px] flex-col px-12 pb-16 pt-10 2xl:max-w-[1760px] 2xl:px-16 2xl:pt-14 min-[2400px]:max-w-[2200px] min-[2400px]:pt-24">
        {/* Hero */}
        <motion.header variants={rise} className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[1fr_auto]">
          <div>
            <p className="text-micro tracking-cinematic text-white/35">{greeting(now)}</p>
            <h1 className="mt-4 font-display text-display-xl font-semibold text-white text-glow">
              WELCOME, {name.toUpperCase()}
            </h1>
            {subtitle && <p className="mt-4 max-w-xl text-[15px] text-white/45">{subtitle}</p>}
            <div className="mt-8 flex items-baseline gap-4">
              <span className="font-display text-[13px] font-semibold tracking-[0.34em] text-white/50">NEXUS</span>
              <span className="h-3 w-px bg-white/15" />
              <span className={cn("font-display text-[13px] tracking-[0.3em]", meta ? TONE_TEXT[meta.tone] : "text-white/30")}>
                {meta ? `SYSTEM ${meta.label.toUpperCase()}` : "CALIBRATING"}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-start gap-4 lg:items-end">
            <p className="font-mono text-display-xl font-light leading-none tabular tracking-tight text-white">{time}{meridiem && <span className="ml-3 text-base text-white/35">{meridiem}</span>}</p>
            <p className="text-micro tracking-wide3 text-white/40">{date}</p>
            <div className="mt-2"><ModeSwitcher /></div>
          </div>
        </motion.header>

        {/* Instrumentation */}
        <motion.section variants={rise} className="mt-16 grid grid-cols-1 gap-x-16 gap-y-10 lg:grid-cols-[minmax(420px,38%)_1fr]">
          <InstrumentLedger />
          <div className="flex flex-col justify-end"><TelemetryWave height={150} /></div>
        </motion.section>

        {/* Context — asymmetric */}
        <motion.section variants={rise} className="mt-20 grid grid-cols-1 gap-x-16 gap-y-12 lg:grid-cols-[1.35fr_1fr]">
          <ErrorBoundary inline label="Continue playing"><ContinuePlaying /></ErrorBoundary>
          <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-1">
            <ErrorBoundary inline label="Communications"><CommsSurface /></ErrorBoundary>
            <ErrorBoundary inline label="Storage"><StorageSurface /></ErrorBoundary>
          </div>
        </motion.section>

        <motion.section variants={rise} className="mt-16 grid grid-cols-1 gap-x-16 gap-y-12 lg:grid-cols-[1.35fr_1fr]">
          <ErrorBoundary inline label="Suggestions"><InsightsSurface /></ErrorBoundary>
          <ErrorBoundary inline label="Recent"><RecentActivity /></ErrorBoundary>
        </motion.section>
      </motion.div>
    </div>
  );
}
