import { ShieldOff } from "lucide-react";
import { SettingsSection, SettingRow, Select } from "../SettingsControls";
import { Toggle, Button } from "@/components/ui";
import { useSettingsStore, type PrivacyAction } from "@/state/settingsStore";
import { usePrivacyStore } from "@/state/privacyStore";
import { useHotkeyStore } from "@/state/hotkeyStore";
import { PRIVACY_HOTKEY_CHOICES } from "@/lib/hotkeys";
import { config } from "@/core/config";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function PrivacySettingsSection() {
  const { privacy, setPrivacy } = useSettingsStore();
  const activate = usePrivacyStore((s) => s.activate);
  const last = usePrivacyStore((s) => s.lastActivatedAt);
  const hotkey = useHotkeyStore();
  const current = PRIVACY_HOTKEY_CHOICES.find((c) => c.value === privacy.hotkey) ?? PRIVACY_HOTKEY_CHOICES[0]!;

  return (
    <SettingsSection title="Privacy" description="The privacy hotkey is immediate: playback pauses first, then the workspace is hidden. No animation.">
      <div className="py-5">
        <div className="flex items-start justify-between gap-12">
          <div className="max-w-xl">
            <p className="text-[15px] text-white/85">Privacy hotkey</p>
            <p className="mt-1 text-[13px] leading-relaxed text-white/40">System-wide — fires even while a game or player has focus. Also works inside NEXUS.</p>
          </div>
          <span className={cn("shrink-0 text-micro", hotkey.registered === true ? "text-status-nominal/80" : hotkey.registered === false ? "text-status-attention" : "text-white/35")}>
            {hotkey.registered === true ? "registered system-wide" : hotkey.registered === false ? "not registered · in-app only" : config.isTauri ? "registering" : "in-app only (preview)"}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          {PRIVACY_HOTKEY_CHOICES.map((c) => (
            <button key={c.value} onClick={() => setPrivacy({ hotkey: c.value })} className={cn("relative pb-1 font-mono text-[13px] transition-colors", current.value === c.value ? "text-white" : "text-white/35 hover:text-white/70")}>
              {c.label}
              {current.value === c.value && <span className="absolute inset-x-0 -bottom-px h-px bg-white" />}
            </button>
          ))}
        </div>
        {hotkey.registered === false && <p className="mt-3 text-[12.5px] text-status-attention/80">Windows refused this shortcut — another application probably owns it. Pick a different one above.</p>}
      </div>
      <SettingRow label="Privacy action" description="What happens after media is paused.">
        <Select<PrivacyAction>
          value={privacy.action}
          onChange={(v) => setPrivacy({ action: v })}
          options={[
            { value: "home", label: "Return to Home" },
            { value: "minimize", label: "Minimize" },
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
        <Button size="sm" variant="outline" onClick={() => activate("test")}><ShieldOff size={13} /> Test</Button>
      </SettingRow>
      <div className="py-5 text-[13px] leading-relaxed text-white/35">
        Media filenames never appear on Home, in activity, or in diagnostics. Removable drives are never scanned without authorization and are excluded from cleanup. Clear media history from Settings → Media.
      </div>
    </SettingsSection>
  );
}
