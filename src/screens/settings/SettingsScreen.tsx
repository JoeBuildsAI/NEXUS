import { AnimatePresence, motion } from "framer-motion";
import { useNavigationStore, type SettingsSection as SectionId } from "@/state/navigationStore";
import { APP_VERSION } from "@/core/version";
import { cn } from "@/lib/utils";
import { GeneralSettings } from "./sections/GeneralSettings";
import { AppearanceSettings } from "./sections/AppearanceSettings";
import { StartupSettingsSection } from "./sections/StartupSettings";
import { GamingSettingsSection } from "./sections/GamingSettings";
import { MediaSettingsSection } from "./sections/MediaSettings";
import { PrivacySettingsSection } from "./sections/PrivacySettings";
import { SystemSettingsSection } from "./sections/SystemSettings";
import { ShortcutsSettingsSection } from "./sections/ShortcutsSettings";
import { IntegrationsSettings } from "./sections/IntegrationsSettings";
import { AISettingsSection } from "./sections/AISettings";

const SECTIONS: { id: SectionId; label: string; C: () => JSX.Element }[] = [
  { id: "general", label: "General", C: GeneralSettings },
  { id: "appearance", label: "Appearance", C: AppearanceSettings },
  { id: "startup", label: "Startup", C: StartupSettingsSection },
  { id: "gaming", label: "Gaming", C: GamingSettingsSection },
  { id: "media", label: "Media", C: MediaSettingsSection },
  { id: "privacy", label: "Privacy", C: PrivacySettingsSection },
  { id: "system", label: "System", C: SystemSettingsSection },
  { id: "shortcuts", label: "Shortcuts", C: ShortcutsSettingsSection },
  { id: "integrations", label: "Integrations", C: IntegrationsSettings },
  { id: "ai", label: "AI", C: AISettingsSection },
];

/** Settings: a typographic index on the left, one section at a time on the right. */
export function SettingsScreen() {
  const active = useNavigationStore((s) => s.settingsSection);
  const setActive = useNavigationStore((s) => s.setSettingsSection);
  const section = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0]!;
  const Content = section.C;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1560px] px-12 pb-20 pt-10 2xl:px-16">
        <div className="grid grid-cols-1 gap-x-24 gap-y-12 lg:grid-cols-[200px_minmax(0,760px)]">
          <nav className="lg:sticky lg:top-0 lg:self-start" aria-label="Settings sections">
            <p className="text-micro tracking-cinematic text-white/35">Settings</p>
            <ul className="mt-6 space-y-1">
              {SECTIONS.map((s) => {
                const on = active === s.id;
                return (
                  <li key={s.id}>
                    <button onClick={() => setActive(s.id)} aria-current={on ? "page" : undefined} className={cn("relative block py-1.5 text-left font-display text-[17px] tracking-wide transition-colors duration-200", on ? "text-white" : "text-white/35 hover:text-white/75")}>
                      {on && <motion.span layoutId="settings-active" className="absolute -left-5 top-1/2 h-4 w-px -translate-y-1/2 bg-white" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                      {s.label}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-10 font-mono text-[10.5px] tracking-wide2 text-white/20">NEXUS {APP_VERSION}</p>
          </nav>

          <div className="pt-1">
            <AnimatePresence mode="wait">
              <motion.div key={section.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                <Content />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
