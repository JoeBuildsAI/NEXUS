import { AppWindow, Gamepad2, HardDrive, Mail } from "lucide-react";
import { SettingsSection, SettingRow } from "../SettingsControls";
import { Badge } from "@/components/ui";
import { config } from "@/core/config";
import { useDevStore } from "@/state/devStore";
import { useAsync } from "@/hooks/useAsync";
import { getProviders } from "@/providers";

export function IntegrationsSettings() {
  const dev = useDevStore();
  const { data: apps } = useAsync(() => getProviders().apps.getApps(), []);
  const steamReal = config.providers.steam === "real";

  return (
    <SettingsSection title="Integrations" description="Connected services. Credentials live in OS secure storage and are never committed.">
      <SettingRow label="Steam" description={steamReal ? "Official Steam Web API." : "Demo library on this machine. Complete RealSteamProvider on the gaming PC."}>
        <div className="flex items-center gap-2">
          <Gamepad2 size={15} className="text-white/40" />
          <Badge tone={steamReal ? "nominal" : dev.steamConnected ? "accent" : "warning"}>{steamReal ? "Connected" : dev.steamConnected ? "Demo library" : "Offline (simulated)"}</Badge>
        </div>
      </SettingRow>
      <SettingRow label="Media root" description="Authorized local folder or drive for the media workspace.">
        <div className="flex items-center gap-2">
          <HardDrive size={15} className="text-white/40" />
          <Badge tone={dev.mediaConnected ? "accent" : "warning"}>{dev.mediaConnected ? "Demo library" : "Disconnected (simulated)"}</Badge>
        </div>
      </SettingRow>
      <SettingRow label="Email" description="Gmail / Microsoft Graph adapters come later.">
        <div className="flex items-center gap-2">
          <Mail size={15} className="text-white/40" />
          <Badge tone={dev.emailConnected ? "accent" : "warning"}>{dev.emailConnected ? "Mock inbox" : "Disconnected (simulated)"}</Badge>
        </div>
      </SettingRow>
      <SettingRow label="Windows applications" description={config.isTauri ? "Discovered from the Start Menu and Windows built-ins. No disk scanning." : "Demo list in browser preview."}>
        <div className="flex items-center gap-2">
          <AppWindow size={15} className="text-white/40" />
          <Badge tone={config.isTauri ? "nominal" : "neutral"}>{apps ? `${apps.length} apps` : "…"}</Badge>
        </div>
      </SettingRow>
      <div className="py-4 text-xs text-white/35">
        Flip providers via <span className="font-mono text-white/50">.env</span> on Joseph's gaming PC — see <span className="font-mono text-white/50">docs/GAMING_PC_SETUP.md</span>.
      </div>
    </SettingsSection>
  );
}
