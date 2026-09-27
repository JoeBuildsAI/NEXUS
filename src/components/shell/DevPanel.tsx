import { AnimatePresence, motion } from "framer-motion";
import { FlaskConical, X, Zap } from "lucide-react";
import { isDevBuild, useDevStore } from "@/state/devStore";
import { useSettingsStore } from "@/state/settingsStore";
import { notify } from "@/state/toastStore";
import { Toggle, Button } from "@/components/ui";
import { DEMO_GAMES } from "@/core/demo/games";

/**
 * Development-only simulation panel (Ctrl+Shift+D). Lets us exercise offline,
 * pressure, and live-event states on the dev laptop. Not rendered in production.
 */
export function DevPanel() {
  const open = useSettingsStore((s) => s.devPanelOpen);
  const setOpen = useSettingsStore((s) => s.setDevPanelOpen);
  const dev = useDevStore();

  if (!isDevBuild) return null;

  const fireAchievement = () => {
    const g = DEMO_GAMES[0]!;
    const locked = g.achievements.achievements.find((a) => !a.unlocked);
    dev.triggerAchievement();
    notify.success(`Achievement unlocked — ${locked?.name ?? "Kings & Pawns"}`, `${g.title} · ${locked?.globalPercent ?? 22}% of players`);
  };
  const fireEmail = () => {
    dev.triggerEmail();
    notify.info("New message from Alex", "Co-op tonight?");
  };

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        title="Developer panel (Ctrl+Shift+D)"
        className="fixed bottom-4 left-[100px] z-[340] flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.06] bg-void-900/60 text-white/20 backdrop-blur transition-colors hover:text-accent"
      >
        <FlaskConical size={14} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            className="glass-strong fixed bottom-14 left-[100px] z-[340] w-72 rounded-2xl p-4 shadow-panel"
          >
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-[11px] uppercase tracking-wide2 text-white/50">
                <FlaskConical size={12} /> Dev simulation
              </p>
              <button onClick={() => setOpen(false)} className="text-white/30 hover:text-white"><X size={14} /></button>
            </div>
            <div className="mt-3 space-y-2.5 text-sm">
              <Toggle label="Steam connected" checked={dev.steamConnected} onChange={(v) => dev.set({ steamConnected: v })} />
              <Toggle label="Media drive connected" checked={dev.mediaConnected} onChange={(v) => dev.set({ mediaConnected: v })} />
              <Toggle label="Email connected" checked={dev.emailConnected} onChange={(v) => dev.set({ emailConnected: v })} />
              <Toggle label="Telemetry available" checked={dev.telemetryAvailable} onChange={(v) => dev.set({ telemetryAvailable: v })} />
              <div className="hairline-t my-1" />
              <Toggle label="Storage pressure" checked={dev.storagePressure} onChange={(v) => dev.set({ storagePressure: v })} />
              <Toggle label="High CPU" checked={dev.highCpu} onChange={(v) => dev.set({ highCpu: v })} />
              <Toggle label="High RAM" checked={dev.highRam} onChange={(v) => dev.set({ highRam: v })} />
              <div className="hairline-t my-1" />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={fireAchievement}><Zap size={12} /> Achievement</Button>
                <Button size="sm" variant="outline" className="flex-1" onClick={fireEmail}>Email</Button>
              </div>
              <p className="pt-1 text-[10px] text-white/25">Mock providers only. Real telemetry ignores these switches.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
