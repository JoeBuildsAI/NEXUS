import { AnimatePresence, motion } from "framer-motion";
import {
  Bot, Gamepad2, Keyboard, Monitor, Palette, Play, Plug, Power, Settings2, ShieldCheck,
} from "lucide-react";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { useNavigationStore, type SettingsSection as SectionId } from "@/state/navigationStore";
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

const SECTIONS: { id: SectionId; label: string; icon: typeof Settings2; C: () => JSX.Element }[] = [
  { id: "general", label: "General", icon: Settings2, C: GeneralSettings },
  { id: "appearance", label: "Appearance", icon: Palette, C: AppearanceSettings },
  { id: "startup", label: "Startup", icon: Power, C: StartupSettingsSection },
  { id: "gaming", label: "Gaming", icon: Gamepad2, C: GamingSettingsSection },
  { id: "media", label: "Media", icon: Play, C: MediaSettingsSection },
  { id: "privacy", label: "Privacy", icon: ShieldCheck, C: PrivacySettingsSection },
  { id: "system", label: "System", icon: Monitor, C: SystemSettingsSection },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard, C: ShortcutsSettingsSection },
  { id: "integrations", label: "Integrations", icon: Plug, C: IntegrationsSettings },
  { id: "ai", label: "AI", icon: Bot, C: AISettingsSection },
];

export function SettingsScreen() {
  const active = useNavigationStore((s) => s.settingsSection);
  const setActive = useNavigationStore((s) => s.setSettingsSection);
  const section = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0]!;
  const Content = section.C;

  return (
    <ScreenShell eyebrow="Configure" title="Settings" subtitle="Your environment, your rules">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[210px_1fr]">
        <nav className="flex flex-col gap-0.5 lg:sticky lg:top-0 lg:self-start">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const on = active === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={cn("relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors", on ? "text-accent" : "text-white/50 hover:bg-white/[0.03] hover:text-white/85")}
              >
                {on && <motion.span layoutId="settings-active" className="absolute inset-0 rounded-lg bg-accent/[0.08]" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                <Icon size={15} className="relative" />
                <span className="relative">{s.label}</span>
              </button>
            );
          })}
          <p className="mt-4 px-3 text-[10px] uppercase tracking-wide2 text-white/25">NEXUS v0.1.0</p>
        </nav>

        <div className="max-w-2xl">
          <AnimatePresence mode="wait">
            <motion.div key={section.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
              <Content />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </ScreenShell>
  );
}
