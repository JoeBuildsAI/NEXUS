import { AlertTriangle } from "lucide-react";
import { SettingsSection, SettingRow } from "../SettingsControls";
import { Toggle } from "@/components/ui";
import { useSettingsStore } from "@/state/settingsStore";

export function SystemSettingsSection() {
  const { system, setSystem } = useSettingsStore();
  const enabled = system.safety === "enabled";

  return (
    <SettingsSection title="System" description="Cleanup and process-management permissions.">
      <div className="flex items-start gap-3 border-b border-white/[0.04] px-5 py-4">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-status-attention" />
        <p className="text-xs leading-relaxed text-white/50">
          NEXUS defaults to <span className="text-white/80">observe-only</span>. It
          never terminates, suspends, or reconfigures anything unless you enable
          management here. Even then, only allowlisted applications are ever
          affected — system-critical, driver, security, and unknown processes are
          always protected.
        </p>
      </div>

      <SettingRow label="System safety mode" description="Observe-only prevents all system mutations.">
        <select
          value={system.safety}
          onChange={(e) => setSystem({ safety: e.target.value as "observe" | "enabled" })}
          className="h-9 rounded-lg border border-white/[0.08] bg-void-800 px-3 text-sm text-white/85 focus:outline-none"
        >
          <option value="observe">Observe only (safe)</option>
          <option value="enabled">Enabled</option>
        </select>
      </SettingRow>

      <SettingRow label="Allow startup changes" description="Permit enabling/disabling startup apps.">
        <Toggle
          checked={system.allowStartupChanges}
          disabled={!enabled}
          onChange={(v) => setSystem({ allowStartupChanges: v })}
        />
      </SettingRow>

      <SettingRow label="Allow process management" description="Permit suspending allowlisted applications.">
        <Toggle
          checked={system.allowProcessManagement}
          disabled={!enabled}
          onChange={(v) => setSystem({ allowProcessManagement: v })}
        />
      </SettingRow>
    </SettingsSection>
  );
}
