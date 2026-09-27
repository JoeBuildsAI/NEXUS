import { motion } from "framer-motion";
import { SystemStatusPanel } from "./SystemStatusPanel";
import {
  CommunicationsCard,
  GamingCard,
  MediaCard,
  RecentActivityCard,
  StorageCard,
} from "./HomeCards";
import { ModeSwitcher } from "@/components/shell/ModeSwitcher";
import { useClock, formatDateLong, formatTime, greeting } from "@/hooks/useClock";

const USER = "Joseph";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export function HomeScreen() {
  const now = useClock();

  return (
    <div className="flex h-full flex-col">
      {/* Hero */}
      <header className="flex items-end justify-between px-8 pt-8 pb-6">
        <div>
          <p className="text-xs uppercase tracking-cinematic text-accent/70">
            {greeting(now)}
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-wide2 text-white">
            WELCOME, {USER.toUpperCase()}
          </h1>
          <p className="mt-2 text-sm text-white/40">{formatDateLong(now)}</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="text-right">
            <p className="font-mono text-4xl font-light tabular-nums text-white/90">
              {formatTime(now)}
            </p>
          </div>
          <ModeSwitcher />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-4 lg:grid-cols-3"
        >
          <motion.div variants={item} className="lg:col-span-2">
            <SystemStatusPanel />
          </motion.div>
          <motion.div variants={item}>
            <GamingCard />
          </motion.div>
          <motion.div variants={item}>
            <CommunicationsCard />
          </motion.div>
          <motion.div variants={item}>
            <StorageCard />
          </motion.div>
          <motion.div variants={item}>
            <MediaCard />
          </motion.div>
          <motion.div variants={item} className="lg:col-span-2">
            <RecentActivityCard />
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
