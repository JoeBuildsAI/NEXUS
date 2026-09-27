import { AnimatePresence, motion } from "framer-motion";
import { FlaskConical, X, Zap } from "lucide-react";
import { isDevBuild, useDevStore } from "@/state/devStore";
import { useMediaStore } from "@/state/mediaStore";
import { useSettingsStore } from "@/state/settingsStore";
import { notify } from "@/state/toastStore";
import { activity } from "@/state/activityStore";
import { Toggle, Button } from "@/components/ui";
import { DEMO_GAMES } from "@/core/demo/games";
import { getProviders } from "@/providers";
import { LIFE_SCENARIOS, syntheticLife } from "@/core/life/synthetic";
import { useLifeStore } from "@/state/lifeStore";
import { getLifeRepository } from "@/providers/life";
import { LIFE_COLLECTIONS } from "@/core/life/models";
import { todayKey } from "@/core/life/time";

async function loadScenario(id: string) {
  const sc = LIFE_SCENARIOS.find((s) => s.id === id);
  if (!sc) return;
  const dump = syntheticLife(todayKey(), sc.opts);
  const repo = getLifeRepository();
  for (const c of LIFE_COLLECTIONS) if (dump[c].length) await repo.put(c, dump[c] as never[]);
  await useLifeStore.getState().load({ force: true });
  notify.neutral("Life lab", `${sc.label} loaded (demo rows)`);
}

/**
 * Development-only simulation panel (Ctrl+Shift+D). Lets us exercise offline,
 * pressure, and live-event states on the dev laptop. Not rendered in production.
 */
declare global {
  interface Window {
    /** Dev builds only: lets the screenshot/stress scripts drive simulations. */
    __nexusDev?: typeof useDevStore;
    __nexusMedia?: typeof useMediaStore;
    __nexusProviders?: ReturnType<typeof getProviders>;
  }
}
if (isDevBuild && typeof window !== "undefined") {
  window.__nexusDev = useDevStore;
  window.__nexusMedia = useMediaStore;
  Object.defineProperty(window, "__nexusProviders", { get: () => getProviders(), configurable: true });
}

export function DevPanel() {
  const open = useSettingsStore((s) => s.devPanelOpen);
  const setOpen = useSettingsStore((s) => s.setDevPanelOpen);
  const dev = useDevStore();

  if (!isDevBuild) return null;

  const fireAchievement = () => {
    const g = DEMO_GAMES[0]!;
    const locked = g.achievements.achievements.find((a) => !a.unlocked);
    dev.triggerAchievement();
    activity.record("achievement-unlocked", `${locked?.name ?? "Kings & Pawns"} · ${g.title}`, { gameId: g.id });
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
        className="fixed bottom-3 left-[84px] z-[250] flex h-6 w-6 items-center justify-center rounded-sm text-white/15 transition-colors hover:text-white/70"
      >
        <FlaskConical size={14} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            className="glass-strong fixed bottom-12 left-[84px] z-[250] w-72 rounded-md p-4"
          >
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-micro text-white/50">
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
              <Cycle label="Steam library" value={dev.steamLibrarySize} options={[0, 500, 1000] as const} onChange={(v) => { dev.set({ steamLibrarySize: v }); void import("@/state/libraryStore").then(({ useLibraryStore }) => { useLibraryStore.getState().clearCache(); void useLibraryStore.getState().load({ force: true }); }); }} format={(v) => (v ? `+${v}` : "demo")} />
              <Cycle label="Media index" value={dev.mediaLibrarySize} options={[0, 1000, 10000] as const} onChange={(v) => dev.set({ mediaLibrarySize: v })} format={(v) => (v ? `+${v}` : "demo")} />
              <Toggle label="Steam profile private" checked={dev.steamPrivateProfile} onChange={(v) => { dev.set({ steamPrivateProfile: v }); void import("@/state/libraryStore").then(({ useLibraryStore }) => useLibraryStore.getState().clearCache()); }} />
              <Toggle label="Extreme titles" checked={dev.extremeText} onChange={(v) => { dev.set({ extremeText: v }); void import("@/state/libraryStore").then(({ useLibraryStore }) => { useLibraryStore.getState().clearCache(); void useLibraryStore.getState().load({ force: true }); }); }} />
              <Toggle label="Provider exceptions" checked={dev.providerExceptions} onChange={(v) => dev.set({ providerExceptions: v })} />
              <Toggle label="Synthetic fixture videos" checked={dev.syntheticVideos} onChange={(v) => dev.set({ syntheticVideos: v })} />
              <div className="hairline-t my-1" />
              <p className="text-micro text-white/35">Life lab · synthetic, demo-flagged</p>
              <select defaultValue="" onChange={(e) => { if (e.target.value) void loadScenario(e.target.value); e.target.value = ""; }} className="w-full bg-transparent text-[12px] text-white/80 [color-scheme:dark] focus:outline-none">
                <option value="">Load a scenario…</option>
                {LIFE_SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <Button size="sm" variant="ghost" className="w-full" onClick={() => void useLifeStore.getState().removeSampleData()}>Remove all demo rows</Button>
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

function Cycle<T extends number>({ label, value, options, onChange, format }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void; format: (v: T) => string }) {
  const next = () => onChange(options[(options.indexOf(value) + 1) % options.length]!);
  return (
    <button onClick={next} className="flex w-full items-center justify-between text-left text-white/70 transition-colors hover:text-white">
      <span>{label}</span>
      <span className="font-mono text-[11px] text-white/45">{format(value)}</span>
    </button>
  );
}
