import { useEffect, useState } from "react";
import { createLogger } from "@/lib/logger";

const log = createLogger("startup");
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
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!config.isTauri) return;
    setApplying(true);
    (async () => {
      try {
        const autostart = await import("@tauri-apps/plugin-autostart");
        const enabled = await autostart.isEnabled();
        if (enabled !== startup.launchOnLogin) {
          if (startup.launchOnLogin) await autostart.enable();
          else await autostart.disable();
        }
      } catch (err) {
        log.warn("autostart apply failed", { error: String(err) });
      } finally {
        setApplying(false);
      }
    })();
  }, [startup.launchOnLogin]);

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
        <Toggle
          checked={startup.launchOnLogin}
          disabled={applying}
          onChange={(v) => setStartup({ launchOnLogin: v })}
        />
      </SettingRow>
      <SettingRow label="Start minimized" description="Launch into the tray without showing the window.">
        <Toggle checked={startup.startMinimized} onChange={(v) => setStartup({ startMinimized: v })} />
      </SettingRow>
      <SettingRow label="Boot animation" description="Play the NEXUS startup sequence on launch.">
        <Toggle checked={startup.startupAnimation} onChange={(v) => setStartup({ startupAnimation: v })} />
      </SettingRow>
    </SettingsSection>
  );
}
