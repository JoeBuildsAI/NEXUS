import { Gamepad2, Mail } from "lucide-react";
import { SettingsSection, SettingRow } from "../SettingsControls";
import { Badge } from "@/components/ui";
import { config } from "@/core/config";

export function IntegrationsSettings() {
  return (
    <SettingsSection title="Integrations" description="Connect external services. Credentials are stored securely and never committed.">
      <SettingRow label="Steam" description="Game library and achievements via the official Steam Web API.">
        <div className="flex items-center gap-2">
          <Gamepad2 size={15} className="text-white/40" />
          <Badge tone={config.providers.steam === "mock" ? "neutral" : "nominal"}>
            {config.providers.steam === "mock" ? "Mock data" : "Connected"}
          </Badge>
        </div>
      </SettingRow>
      <SettingRow label="Email" description="Gmail or Microsoft Graph. Adapter implementations coming soon.">
        <div className="flex items-center gap-2">
          <Mail size={15} className="text-white/40" />
          <Badge tone="neutral">Mock data</Badge>
        </div>
      </SettingRow>
      <div className="px-5 py-4 text-xs text-white/35">
        On Joseph's gaming PC, enable real providers via environment configuration.
        See <span className="font-mono text-white/50">docs/GAMING_PC_SETUP.md</span>.
      </div>
    </SettingsSection>
  );
}
