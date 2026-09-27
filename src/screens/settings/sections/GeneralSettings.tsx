import { SettingsSection, SettingRow } from "../SettingsControls";
import { Toggle } from "@/components/ui";
import { useSettingsStore } from "@/state/settingsStore";

export function GeneralSettings() {
  const { startup, setStartup } = useSettingsStore();
  return (
    <SettingsSection title="General" description="Core application behavior.">
      <SettingRow label="Launch on login" description="Start NEXUS automatically after you sign in to Windows.">
        <Toggle checked={startup.launchOnLogin} onChange={(v) => setStartup({ launchOnLogin: v })} />
      </SettingRow>
      <SettingRow label="Start minimized" description="Open directly to the system tray on launch.">
        <Toggle checked={startup.startMinimized} onChange={(v) => setStartup({ startMinimized: v })} />
      </SettingRow>
      <SettingRow label="Startup animation" description="Show the cinematic boot sequence.">
        <Toggle checked={startup.startupAnimation} onChange={(v) => setStartup({ startupAnimation: v })} />
      </SettingRow>
    </SettingsSection>
  );
}
