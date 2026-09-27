import { useState } from "react";
import {
  Bot,
  Gamepad2,
  Monitor,
  Palette,
  Play,
  Plug,
  Power,
  Settings2,
  ShieldCheck,
  Sliders,
} from "lucide-react";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { cn } from "@/lib/utils";
import { GeneralSettings } from "./sections/GeneralSettings";
import { AppearanceSettings } from "./sections/AppearanceSettings";
import { StartupSettingsSection } from "./sections/StartupSettings";
import { GamingSettingsSection } from "./sections/GamingSettings";
import { MediaSettingsSection } from "./sections/MediaSettings";
import { PrivacySettingsSection } from "./sections/PrivacySettings";
import { SystemSettingsSection } from "./sections/SystemSettings";
import { IntegrationsSettings } from "./sections/IntegrationsSettings";
import { AISettingsSection } from "./sections/AISettings";

const SECTIONS = [
  { id: "general", label: "General", icon: Settings2, C: GeneralSettings },
  { id: "appearance", label: "Appearance", icon: Palette, C: AppearanceSettings },
  { id: "startup", label: "Startup", icon: Power, C: StartupSettingsSection },
  { id: "gaming", label: "Gaming", icon: Gamepad2, C: GamingSettingsSection },
  { id: "media", label: "Media", icon: Play, C: MediaSettingsSection },
  { id: "privacy", label: "Privacy", icon: ShieldCheck, C: PrivacySettingsSection },
  { id: "system", label: "System", icon: Monitor, C: SystemSettingsSection },
  { id: "integrations", label: "Integrations", icon: Plug, C: IntegrationsSettings },
  { id: "ai", label: "AI", icon: Bot, C: AISettingsSection },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function SettingsScreen() {
  const [active, setActive] = useState<SectionId>("general");
  const section = SECTIONS.find((s) => s.id === active)!;
  const Content = section.C;

  return (
    <ScreenShell title="Settings" subtitle="Configure your NEXUS environment">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_1fr]">
        <nav className="flex flex-col gap-1">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  active === s.id
                    ? "bg-accent/10 text-accent"
                    : "text-white/55 hover:bg-white/[0.03] hover:text-white/85",
                )}
              >
                <Icon size={15} />
                {s.label}
              </button>
            );
          })}
          <div className="mt-3 flex items-center gap-2 px-3 text-[10px] uppercase tracking-wide2 text-white/25">
            <Sliders size={11} /> v0.1.0
          </div>
        </nav>

        <div className="max-w-2xl">
          <Content />
        </div>
      </div>
    </ScreenShell>
  );
}
