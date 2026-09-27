import { SettingsSection, SettingRow } from "../SettingsControls";
import { Toggle } from "@/components/ui";
import { useSettingsStore } from "@/state/settingsStore";

export function PrivacySettingsSection() {
  const { privacy, setPrivacy } = useSettingsStore();
  return (
    <SettingsSection title="Privacy" description="Global privacy hotkey and behavior.">
      <SettingRow label="Privacy hotkey" description="Global shortcut to instantly hide the media workspace.">
        <code className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 font-mono text-xs text-white/80">
          {privacy.hotkey}
        </code>
      </SettingRow>
      <SettingRow label="Privacy action" description="What happens when privacy mode is triggered.">
        <select
          value={privacy.action}
          onChange={(e) => setPrivacy({ action: e.target.value as "home" | "minimize" })}
          className="h-9 rounded-lg border border-white/[0.08] bg-void-800 px-3 text-sm text-white/85 focus:outline-none"
        >
          <option value="home">Return to Home</option>
          <option value="minimize">Minimize NEXUS</option>
        </select>
      </SettingRow>
      <SettingRow label="Stop playback on trigger" description="Immediately pause all media when privacy mode activates.">
        <Toggle checked={privacy.stopPlaybackOnTrigger} onChange={(v) => setPrivacy({ stopPlaybackOnTrigger: v })} />
      </SettingRow>
    </SettingsSection>
  );
}
