import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, FolderPlus, Gamepad2, Mail } from "lucide-react";
import { useLifeStore } from "@/state/lifeStore";
import { ROUTINE_TEMPLATES } from "@/core/life/routines";
import { useSettingsStore, type EnvironmentPreset } from "@/state/settingsStore";
import { useNavigationStore } from "@/state/navigationStore";
import { ENVIRONMENTS } from "@/components/background/environments";
import { Button, Toggle } from "@/components/ui";
import { EnvironmentScanList } from "./EnvironmentScan";
import { useEnvironmentScan } from "@/hooks/useEnvironmentScan";
import { cn } from "@/lib/utils";

/** What NEXUS can and cannot do — short, no legal wall. */
const PERMISSIONS: { area: string; can: string; cannot: string }[] = [
  { area: "System", can: "Read hardware, process and telemetry information", cannot: "Never terminates or reconfigures anything unless you enable it" },
  { area: "Gaming", can: "Launch discovered Steam games; manage only apps you approve", cannot: "Never force-kills; power plan changes are recorded and reversed" },
  { area: "Media", can: "Read only folders you select, on this machine", cannot: "Never scans drives; filenames never leave Media" },
  { area: "Storage", can: "Analyze fixed drives; clean known temporary locations after approval", cannot: "Never removable media, documents, games or applications" },
  { area: "Life", can: "Store routines, workouts, meals, groceries, calendar and tasks in a local database", cannot: "Never uploads them; export and backups stay on this machine" },
  { area: "Mail", can: "Read and organize mailboxes you connect, with your own app registration", cannot: "Never sends email; tokens stay in Windows Credential Manager" },
  { area: "AI", can: "Optional, off by default; only proposes, you approve", cannot: "Nothing leaves this machine unless you configure a provider" },
];

const MODULES: { id: "life" | "play" | "media" | "comms"; label: string; body: string }[] = [
  { id: "life", label: "Today · Life", body: "Calendar, routines, fitness, nutrition, meals, groceries, tasks — local-first." },
  { id: "play", label: "Play", body: "Steam and Xbox PC games in one console-style library, Gaming Mode." },
  { id: "media", label: "Media", body: "Private local video wall with A–B loops and a privacy hotkey." },
  { id: "comms", label: "Communications", body: "Gmail and Outlook inbox intelligence, unsubscribe and cleanup." },
];

/**
 * First-run experience: WELCOME → ENVIRONMENT (local discovery, never scans
 * removable media) → MODULES → PERSONALIZE → LIFE SETUP (optional) → PRIVACY /
 * READY. Everything is skippable; replayable from Settings → General.
 */
export function Onboarding() {
  const profile = useSettingsStore((s) => s.profile);
  const setProfile = useSettingsStore((s) => s.setProfile);
  const appearance = useSettingsStore((s) => s.appearance);
  const setAppearance = useSettingsStore((s) => s.setAppearance);
  const startup = useSettingsStore((s) => s.startup);
  const setStartup = useSettingsStore((s) => s.setStartup);
  const navigate = useNavigationStore((s) => s.navigate);
  const setSection = useNavigationStore((s) => s.setSettingsSection);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile.name || "");
  const [modules, setModules] = useState<Record<string, boolean>>({ life: true, play: true, media: true, comms: true });
  const [lifeChoice, setLifeChoice] = useState<"sample" | "routine" | "none">("none");
  const [routineTemplate, setRoutineTemplate] = useState(ROUTINE_TEMPLATES[0]!.id);
  const scan = useEnvironmentScan(step === 1);
  const STEP_COUNT = 6;

  if (profile.onboardingComplete) return null;

  const finish = (then?: () => void) => {
    setProfile({ name: name.trim() || "Joseph", onboardingComplete: true });
    const life = useLifeStore.getState();
    if (lifeChoice === "sample") void life.load().then(() => life.addSampleData());
    else if (lifeChoice === "routine") {
      const t = ROUTINE_TEMPLATES.find((x) => x.id === routineTemplate);
      if (t) void life.load().then(() => life.saveRoutine({ name: t.name, category: t.category, schedule: t.schedule, preferredMinute: t.preferredMinute, enabled: true, steps: t.steps.map((title, order) => ({ id: "", title, order })) }));
    }
    then?.();
    if (!then && !modules.life) navigate(modules.play ? "gaming" : modules.media ? "media" : "system");
  };
  const goConfigure = (section: "integrations" | "media") => finish(() => { navigate("settings"); setSection(section); });

  return (
    <motion.div className="fixed inset-0 z-[290] flex items-center justify-center bg-black/95 backdrop-blur-xl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto px-8 py-6">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="s0" {...fade} className="text-center">
              <p className="text-micro tracking-cinematic text-white/35">First run</p>
              <h1 className="mt-5 font-display text-display-lg font-semibold tracking-[0.22em] text-white text-glow">WELCOME TO NEXUS</h1>
              <p className="mx-auto mt-6 max-w-md text-[14px] leading-relaxed text-white/45">A personal operating layer for Windows. Cinematic, restrained, and entirely under your control.</p>
              <Button variant="primary" size="lg" className="mt-10" onClick={() => setStep(1)}>Begin <ArrowRight size={16} /></Button>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div key="s1" {...fade} className="text-center">
              <p className="text-micro tracking-cinematic text-white/35">{scan.done ? "Environment" : "Scanning environment"}</p>
              <h2 className="mt-3 font-display text-display-md font-semibold tracking-wide text-white">{scan.done ? "Here's what NEXUS found" : "Discovering your machine"}</h2>
              <p className="mx-auto mt-3 max-w-md text-[13px] text-white/40">Local detection only. Removable drives are never scanned — media is authorized by you, folder by folder.</p>
              <div className="mt-8"><EnvironmentScanList lines={scan.lines} /></div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: scan.done ? 1 : 0 }} className="mt-10 flex justify-center">
                <Button variant="primary" size="lg" onClick={() => setStep(2)}>Continue <ArrowRight size={15} /></Button>
              </motion.div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="s2m" {...fade}>
              <p className="text-micro tracking-cinematic text-white/35">Modules</p>
              <h2 className="mt-3 font-display text-display-md font-semibold tracking-wide text-white">What should NEXUS be for you?</h2>
              <p className="mt-3 max-w-md text-[13px] text-white/40">Everything stays available; this only decides where you land and what onboarding suggests. Change your mind anytime.</p>
              <div className="mt-8 divide-y divide-white/[0.06]">
                {MODULES.map((m) => (
                  <button key={m.id} onClick={() => setModules((x) => ({ ...x, [m.id]: !x[m.id] }))} className="grid w-full grid-cols-[28px_1fr] gap-5 py-4 text-left">
                    <span className={cn("mt-1 flex h-5 w-5 items-center justify-center rounded-full border", modules[m.id] ? "border-white bg-white text-black" : "border-white/25")}>{modules[m.id] && <Check size={12} />}</span>
                    <span><span className="block text-[15px] text-white/90">{m.label}</span><span className="mt-0.5 block text-[12.5px] text-white/40">{m.body}</span></span>
                  </button>
                ))}
              </div>
              <div className="mt-10 flex items-center justify-between">
                <button onClick={() => setStep(1)} className="text-[13px] text-white/35 hover:text-white/70">Back</button>
                <Button variant="primary" size="lg" onClick={() => setStep(3)}>Continue <ArrowRight size={16} /></Button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="s2" {...fade}>
              <p className="text-micro tracking-cinematic text-white/35">Personalize</p>
              <h2 className="mt-3 font-display text-display-md font-semibold tracking-wide text-white">Make it yours</h2>

              <label className="mt-8 block">
                <span className="label">Your name</span>
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && finish()} placeholder="Joseph" className="mt-2 h-14 w-full border-b border-white/15 bg-transparent font-display text-display-sm tracking-wide text-white placeholder:text-white/20 focus:border-white/70 focus:outline-none" />
              </label>

              <div className="mt-8">
                <span className="label">Preferred environment</span>
                <div className="mt-4 grid grid-cols-5 gap-3">
                  {(Object.keys(ENVIRONMENTS) as EnvironmentPreset[]).map((key) => {
                    const env = ENVIRONMENTS[key];
                    const active = appearance.environment === key;
                    return (
                      <button key={key} onClick={() => setAppearance({ environment: key })} className="group relative text-left">
                        <div className={cn("h-12 rounded-sm transition-shadow", active ? "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.7)]" : "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] group-hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25)]")} style={{ background: `radial-gradient(120% 90% at 50% 0%, ${env.base[0]}, ${env.base[1]} 55%, ${env.base[2]})` }} />
                        <p className={cn("mt-2 text-micro", active ? "text-white" : "text-white/40")}>{env.label}</p>
                        {active && <Check size={11} className="absolute right-1.5 top-1.5 text-white" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-8 space-y-4">
                <Toggle label="Launch NEXUS with Windows" description="Start after you sign in." checked={startup.launchOnLogin} onChange={(v) => setStartup({ launchOnLogin: v })} />
                <Toggle label="Reduced motion" description="Minimize animation for comfort and performance." checked={appearance.reducedMotion} onChange={(v) => setAppearance({ reducedMotion: v })} />
              </div>

              <div className="mt-10 flex items-center justify-between">
                <button onClick={() => setStep(2)} className="text-[13px] text-white/35 hover:text-white/70">Back</button>
                <Button variant="primary" size="lg" onClick={() => setStep(modules.life ? 4 : 5)}>Continue <ArrowRight size={16} /></Button>
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div key="s4" {...fade}>
              <p className="text-micro tracking-cinematic text-white/35">Life setup</p>
              <h2 className="mt-3 font-display text-display-md font-semibold tracking-wide text-white">Start with something on your day</h2>
              <p className="mt-3 max-w-md text-[13px] text-white/40">Optional. Everything is stored locally and editable later. Sample data is clearly labelled and removable in one step.</p>
              <div className="mt-8 divide-y divide-white/[0.06]">
                {([["none", "Start empty", "Create routines, workouts and meals as you go."], ["routine", "Create one routine now", "Pick a template; you can edit every step afterwards."], ["sample", "Load sample data", "A full week of routines, workouts, meals, groceries, tasks and events to explore."]] as const).map(([id, label, body]) => (
                  <button key={id} onClick={() => setLifeChoice(id)} className="grid w-full grid-cols-[28px_1fr] gap-5 py-4 text-left">
                    <span className={cn("mt-1 flex h-5 w-5 items-center justify-center rounded-full border", lifeChoice === id ? "border-white bg-white text-black" : "border-white/25")}>{lifeChoice === id && <Check size={12} />}</span>
                    <span><span className="block text-[15px] text-white/90">{label}</span><span className="mt-0.5 block text-[12.5px] text-white/40">{body}</span></span>
                  </button>
                ))}
              </div>
              {lifeChoice === "routine" && (
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px]">
                  {ROUTINE_TEMPLATES.map((t) => <button key={t.id} onClick={() => setRoutineTemplate(t.id)} className={cn(routineTemplate === t.id ? "text-white" : "text-white/40 hover:text-white/80")}>{t.name}</button>)}
                </div>
              )}
              <div className="mt-10 flex items-center justify-between">
                <button onClick={() => setStep(3)} className="text-[13px] text-white/35 hover:text-white/70">Back</button>
                <Button variant="primary" size="lg" onClick={() => setStep(5)}>Continue <ArrowRight size={16} /></Button>
              </div>
            </motion.div>
          )}

          {step === 5 && (
            <motion.div key="s3" {...fade}>
              <p className="text-micro tracking-cinematic text-white/35">Privacy · Ready</p>
              <h2 className="mt-3 font-display text-display-md font-semibold tracking-wide text-white">What NEXUS can do</h2>
              <div className="mt-8 divide-y divide-white/[0.06]">
                {PERMISSIONS.map((p, i) => (
                  <motion.div key={p.area} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + i * 0.08 }} className="grid grid-cols-[110px_1fr] gap-6 py-2.5">
                    <span className="font-display text-[12px] font-semibold uppercase tracking-[0.22em] text-white/70">{p.area}</span>
                    <span>
                      <span className="block text-[13.5px] text-white/85">{p.can}</span>
                      <span className="mt-0.5 block text-[12px] text-white/38">{p.cannot}</span>
                    </span>
                  </motion.div>
                ))}
              </div>
              <p className="mt-6 text-[12.5px] text-white/35">Optional connections can wait: Steam achievements need a Web API key, Gmail/Outlook need your own app registration, the private library needs a folder you choose.</p>
              <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {modules.play && <Button variant="ghost" size="sm" onClick={() => goConfigure("integrations")}><Gamepad2 size={14} /> Steam · Xbox</Button>}
                  {modules.comms && <Button variant="ghost" size="sm" onClick={() => goConfigure("integrations")}><Mail size={14} /> Gmail · Outlook</Button>}
                  {modules.media && <Button variant="ghost" size="sm" onClick={() => goConfigure("media")}><FolderPlus size={14} /> Authorize media</Button>}
                </div>
                <Button variant="primary" size="lg" onClick={() => finish()}>Enter NEXUS <ArrowRight size={16} /></Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-10 flex justify-center gap-1.5">
          {Array.from({ length: STEP_COUNT }, (_, i) => <span key={i} className={cn("h-px transition-all", i === step ? "w-8 bg-white" : "w-3 bg-white/20")} />)}
        </div>
      </div>
    </motion.div>
  );
}

const fade = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
};
