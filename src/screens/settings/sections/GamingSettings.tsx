import { useState } from "react";
import { Plus, X } from "lucide-react";
import { SettingsSection, SettingRow } from "../SettingsControls";
import { Toggle, Button, Badge } from "@/components/ui";
import { useSettingsStore } from "@/state/settingsStore";

/**
 * Gaming Mode config, including the background-app ALLOWLIST. Only apps on this
 * explicit list are ever eligible for suspension when Gaming Mode is enabled and
 * system safety is set to "enabled". Nothing else is ever touched.
 */
export function GamingSettingsSection() {
  const { gaming, setGaming } = useSettingsStore();
  const [draft, setDraft] = useState("");

  const addApp = () => {
    const name = draft.trim();
    if (!name || gaming.approvedBackgroundApps.includes(name)) return;
    setGaming({ approvedBackgroundApps: [...gaming.approvedBackgroundApps, name] });
    setDraft("");
  };

  const removeApp = (name: string) =>
    setGaming({
      approvedBackgroundApps: gaming.approvedBackgroundApps.filter((a) => a !== name),
    });

  return (
    <SettingsSection title="Gaming" description="Gaming Mode behavior and launcher configuration.">
      <SettingRow label="Gaming Mode" description="Enable the Gaming operating mode and its optimizations.">
        <Toggle checked={gaming.gamingModeEnabled} onChange={(v) => setGaming({ gamingModeEnabled: v })} />
      </SettingRow>

      <div className="px-5 py-4">
        <p className="text-sm text-white/85">Approved background apps</p>
        <p className="mt-0.5 text-xs text-white/40">
          Only these apps can be suspended in Gaming Mode. Add the exact process
          name (e.g. <span className="font-mono">Spotify.exe</span>).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {gaming.approvedBackgroundApps.map((app) => (
            <Badge key={app} tone="accent" className="gap-2 py-1 pr-1">
              <span className="font-mono">{app}</span>
              <button
                onClick={() => removeApp(app)}
                className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-white/10"
                aria-label={`Remove ${app}`}
              >
                <X size={11} />
              </button>
            </Badge>
          ))}
          {gaming.approvedBackgroundApps.length === 0 && (
            <span className="text-xs text-white/30">No apps on the allowlist.</span>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addApp()}
            placeholder="ProcessName.exe"
            className="h-9 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 font-mono text-sm text-white/85 placeholder:text-white/25 focus:border-accent/40 focus:outline-none"
          />
          <Button size="sm" variant="outline" onClick={addApp}>
            <Plus size={14} /> Add
          </Button>
        </div>
      </div>

      <SettingRow label="Default launcher" description="Preferred launcher for game actions.">
        <select
          value={gaming.defaultLauncher}
          onChange={(e) => setGaming({ defaultLauncher: e.target.value })}
          className="h-9 rounded-lg border border-white/[0.08] bg-void-800 px-3 text-sm text-white/85 focus:outline-none"
        >
          <option value="steam">Steam</option>
          <option value="epic">Epic</option>
          <option value="gog">GOG</option>
          <option value="xbox">Xbox</option>
        </select>
      </SettingRow>
    </SettingsSection>
  );
}
