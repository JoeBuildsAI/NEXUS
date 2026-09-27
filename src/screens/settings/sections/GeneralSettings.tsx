import { RotateCcw } from "lucide-react";
import { SettingsSection, SettingRow } from "../SettingsControls";
import { Toggle, Button } from "@/components/ui";
import { useSettingsStore } from "@/state/settingsStore";
import { config } from "@/core/config";
import { Badge } from "@/components/ui";

export function GeneralSettings() {
  const { startup, setStartup, profile, setProfile } = useSettingsStore();
  return (
    <SettingsSection title="General" description="Identity and core application behavior.">
      <SettingRow label="Your name" description="Used for the welcome greeting.">
        <input
          value={profile.name}
          onChange={(e) => setProfile({ name: e.target.value })}
          className="h-9 w-44 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 text-sm text-white/85 focus:border-accent/40 focus:outline-none"
        />
      </SettingRow>
      <SettingRow label="Launch on login" description="Start NEXUS automatically after you sign in to Windows.">
        <Toggle checked={startup.launchOnLogin} onChange={(v) => setStartup({ launchOnLogin: v })} />
      </SettingRow>
      <SettingRow label="Start minimized" description="Open directly to the system tray on launch.">
        <Toggle checked={startup.startMinimized} onChange={(v) => setStartup({ startMinimized: v })} />
      </SettingRow>
      <SettingRow label="Startup animation" description="Show the cinematic boot sequence.">
        <Toggle checked={startup.startupAnimation} onChange={(v) => setStartup({ startupAnimation: v })} />
      </SettingRow>
      <SettingRow label="Replay onboarding" description="Run the first-run experience again.">
        <Button size="sm" variant="outline" onClick={() => setProfile({ onboardingComplete: false })}><RotateCcw size={13} /> Replay</Button>
      </SettingRow>
      <SettingRow label="Runtime" description="How NEXUS is running right now.">
        <div className="flex gap-1.5">
          <Badge tone={config.isTauri ? "nominal" : "neutral"}>{config.isTauri ? "Desktop" : "Browser preview"}</Badge>
          {config.demoMode && <Badge tone="accent">Demo data</Badge>}
        </div>
      </SettingRow>
    </SettingsSection>
  );
}
