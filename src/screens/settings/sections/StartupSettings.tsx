import { SettingsSection, SettingRow } from "../SettingsControls";
import { Toggle } from "@/components/ui";
import { useSettingsStore } from "@/state/settingsStore";
import { config } from "@/core/config";

/**
 * Startup / autostart. When running under Tauri, "launch on login" is applied via
 * the autostart plugin. In browser dev it only updates the stored preference.
 */
export function StartupSettingsSection() {
  const { startup, setStartup } = useSettingsStore();
  // Registration itself happens globally (useNativeEvents) so it applies no matter
  // where the toggle lives and is verified against the real autostart state.

  return (
    <SettingsSection title="Startup" description="Control how NEXUS starts with Windows.">
      <SettingRow
        label="Launch on login"
        description={
          config.isTauri
            ? "Registers NEXUS to start after Windows sign-in."
            : "Applied on the desktop build. (Preview mode stores the preference.)"
        }
      >
        <Toggle checked={startup.launchOnLogin} onChange={(v) => setStartup({ launchOnLogin: v })} />
      </SettingRow>
      <SettingRow label="Start minimized" description="When launched at login, stay in the tray instead of opening the window.">
        <Toggle checked={startup.startMinimized} onChange={(v) => setStartup({ startMinimized: v })} />
      </SettingRow>
      <SettingRow label="Boot animation" description="Play the NEXUS startup sequence on launch.">
        <Toggle checked={startup.startupAnimation} onChange={(v) => setStartup({ startupAnimation: v })} />
      </SettingRow>
    </SettingsSection>
  );
}
