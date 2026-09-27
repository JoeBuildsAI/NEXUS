import { ShieldOff } from "lucide-react";
import { SettingsSection, SettingRow, Select } from "../SettingsControls";
import { Toggle, Button } from "@/components/ui";
import { useSettingsStore, type PrivacyAction } from "@/state/settingsStore";
import { usePrivacyStore } from "@/state/privacyStore";
import { formatRelativeTime } from "@/lib/utils";

export function PrivacySettingsSection() {
  const { privacy, setPrivacy } = useSettingsStore();
  const activate = usePrivacyStore((s) => s.activate);
  const last = usePrivacyStore((s) => s.lastActivatedAt);

  return (
    <SettingsSection title="Privacy" description="The privacy hotkey is immediate: media pauses first, then the workspace is hidden.">
      <SettingRow label="Privacy hotkey" description="Global — works even when NEXUS is not focused (desktop build).">
        <code className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 font-mono text-xs text-white/80">Ctrl + Shift + `</code>
      </SettingRow>
      <SettingRow label="Privacy action" description="What happens after media is paused.">
        <Select<PrivacyAction>
          value={privacy.action}
          onChange={(v) => setPrivacy({ action: v })}
          options={[
            { value: "home", label: "Return to Home" },
            { value: "minimize", label: "Minimize NEXUS" },
            { value: "tray", label: "Hide to tray" },
          ]}
        />
      </SettingRow>
      <SettingRow label="Pause media" description="Pause all players the instant privacy mode triggers.">
        <Toggle checked={privacy.stopPlaybackOnTrigger} onChange={(v) => setPrivacy({ stopPlaybackOnTrigger: v })} />
      </SettingRow>
      <SettingRow label="Clear current workspace" description="Also unload every player so nothing resumes when you return.">
        <Toggle checked={privacy.clearWorkspaceOnTrigger} onChange={(v) => setPrivacy({ clearWorkspaceOnTrigger: v })} />
      </SettingRow>
      <SettingRow label="Test privacy mode" description={last ? `Last activated ${formatRelativeTime(last)}.` : "Fire the full privacy sequence now."}>
        <Button size="sm" variant="outline" onClick={() => activate("test")}><ShieldOff size={13} /> Test privacy mode</Button>
      </SettingRow>
      <div className="py-4 text-xs leading-relaxed text-white/35">
        Media filenames never appear on Home or in activity. Removable drives are never scanned without authorization and are excluded from cleanup. Clear media history from Settings → Media.
      </div>
    </SettingsSection>
  );
}
