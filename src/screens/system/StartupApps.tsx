import { Power, Rocket } from "lucide-react";
import { Panel, PanelHeader, Badge, Toggle } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { getProviders } from "@/providers";
import { useSettingsStore } from "@/state/settingsStore";
import type { StartupApp } from "@/core/types";
import { useState } from "react";

const IMPACT_TONE = {
  low: "nominal",
  medium: "attention",
  high: "warning",
  unknown: "neutral",
} as const;

export function StartupApps() {
  const { data } = useAsync<readonly StartupApp[]>(
    () => getProviders().system.getStartupApps(),
    [],
  );
  const allowChanges = useSettingsStore((s) => s.system.allowStartupChanges);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const apps = (data ?? []).map((a) => ({
    ...a,
    enabled: overrides[a.id] ?? a.enabled,
  }));

  return (
    <Panel>
      <div className="flex items-center justify-between px-5 pt-4">
        <PanelHeader title="Startup Applications" icon={<Rocket size={14} />} className="p-0" />
        {!allowChanges && (
          <Badge tone="neutral">Read-only · enable in Settings</Badge>
        )}
      </div>
      <div className="mt-2 divide-y divide-white/[0.04] px-5 pb-4">
        {apps.map((app) => (
          <div key={app.id} className="flex items-center gap-3 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04] text-white/40">
              <Power size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-white/85">{app.name}</p>
              <p className="truncate text-[11px] text-white/35">
                {app.publisher ?? "Unknown publisher"}
              </p>
            </div>
            <Badge tone={IMPACT_TONE[app.impact]}>{app.impact} impact</Badge>
            <Toggle
              checked={app.enabled}
              disabled={!allowChanges}
              onChange={(v) => setOverrides((o) => ({ ...o, [app.id]: v }))}
            />
          </div>
        ))}
      </div>
    </Panel>
  );
}
