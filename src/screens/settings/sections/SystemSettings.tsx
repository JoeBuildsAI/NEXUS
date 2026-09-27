import { AlertTriangle } from "lucide-react";
import { SettingsSection, SettingRow, Select } from "../SettingsControls";
import { Toggle } from "@/components/ui";
import { useSettingsStore } from "@/state/settingsStore";
import { useTelemetryStore } from "@/state/telemetryStore";
import { DiagnosticsPanel } from "./DiagnosticsPanel";

export function SystemSettingsSection() {
  const { system, setSystem } = useSettingsStore();
  const enabled = system.safety === "enabled";
  const adapters = useTelemetryStore((st) => st.snapshot?.gpuAdapters ?? []);

  return (
    <SettingsSection title="System" description="Cleanup and process-management permissions.">
      <div className="flex items-start gap-4 py-5">
        <AlertTriangle size={15} className="mt-1 shrink-0 text-status-attention/80" />
        <p className="max-w-xl text-[13px] leading-relaxed text-white/50">
          NEXUS defaults to <span className="text-white/80">observe-only</span>. It
          never terminates, suspends, or reconfigures anything unless you enable
          management here. Even then, only allowlisted applications are ever
          affected — system-critical, driver, security, and unknown processes are
          always protected.
        </p>
      </div>

      <SettingRow label="System safety mode" description="Observe-only prevents all system mutations.">
        <Select value={system.safety} onChange={(v) => setSystem({ safety: v })} options={[{ value: "observe" as const, label: "Observe only" }, { value: "enabled" as const, label: "Enabled" }]} />
      </SettingRow>

      <SettingRow label="Allow startup changes" description="Permit enabling/disabling startup apps.">
        <Toggle
          checked={system.allowStartupChanges}
          disabled={!enabled}
          onChange={(v) => setSystem({ allowStartupChanges: v })}
        />
      </SettingRow>

      <SettingRow label="Allow process management" description="Permit gracefully closing allowlisted applications when Gaming Mode starts.">
        <Toggle
          checked={system.allowProcessManagement}
          disabled={!enabled}
          onChange={(v) => setSystem({ allowProcessManagement: v })}
        />
      </SettingRow>
      {adapters.length > 1 && (
        <SettingRow label="Primary GPU" description="NEXUS picks the adapter with the most dedicated memory. Override if the integrated GPU is being reported instead.">
          <Select
            value={system.preferredGpu ?? "auto"}
            onChange={(v) => setSystem({ preferredGpu: v === "auto" ? null : v })}
            options={[{ value: "auto", label: "Auto" }, ...adapters.filter((a) => a.luid).map((a) => ({ value: a.luid!, label: a.name.replace(/^NVIDIA GeForce /, "").replace(/(TM)|(R)/gi, "").trim() }))]}
          />
        </SettingRow>
      )}
      <DiagnosticsPanel />
    </SettingsSection>
  );
}
