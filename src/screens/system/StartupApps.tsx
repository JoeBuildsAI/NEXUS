import { useMemo, useState } from "react";
import { Lock, Power, RotateCcw, Rocket, Shield } from "lucide-react";
import { Toggle, Button } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { getProviders } from "@/providers";
import { native } from "@/providers/system/nativeBridge";
import { useSettingsStore } from "@/state/settingsStore";
import { useStartupChangesStore } from "@/state/startupChangesStore";
import { useNavigationStore } from "@/state/navigationStore";
import { notify } from "@/state/toastStore";
import { config } from "@/core/config";
import type { StartupApp } from "@/core/types";
import { cn } from "@/lib/utils";

type StartupClass = "protected" | "user" | "read-only";

const PROTECTED_HINTS = ["defender", "securityhealth", "msmpeng", "nvidia", "nvcontainer", "realtek", "intel", "amd", "ctfmon", "onedrive"]; // OneDrive is Windows component here

function classify(app: StartupApp): { cls: StartupClass; why: string } {
  const c = `${app.name} ${app.command}`.toLowerCase();
  if (PROTECTED_HINTS.some((h) => c.includes(h)) || c.includes("\\windows\\")) return { cls: "protected", why: "Security, driver or Windows component — protected" };
  if (!app.id.startsWith("hkcu:")) return { cls: "read-only", why: app.id.startsWith("folder:") ? "Startup-folder shortcut — read only" : "All-users entry — requires administrator; read only" };
  return { cls: "user", why: "Current-user startup entry" };
}

export function StartupApps() {
  const { data, reload } = useAsync<readonly StartupApp[]>(() => getProviders().system.getStartupApps(), []);
  const allowChanges = useSettingsStore((s) => s.system.allowStartupChanges);
  const safety = useSettingsStore((s) => s.system.safety);
  const changes = useStartupChangesStore((s) => s.changes);
  const record = useStartupChangesStore((s) => s.record);
  const forget = useStartupChangesStore((s) => s.forget);
  const navigate = useNavigationStore((s) => s.navigate);
  const setSection = useNavigationStore((s) => s.setSettingsSection);
  const [busy, setBusy] = useState<string | null>(null);

  const canManage = config.isTauri && safety === "enabled" && allowChanges;
  const apps = useMemo(() => (data ?? []).map((a) => ({ ...a, ...classify(a) })), [data]);

  const toggle = async (app: StartupApp & { cls: StartupClass }, enabled: boolean) => {
    setBusy(app.id);
    const r = await native.startupSetEnabled(app.id, enabled);
    setBusy(null);
    if (!r.ok) {
      notify.error("Could not change startup entry", r.error);
      return;
    }
    record({ id: app.id, name: app.name, previousEnabled: app.enabled });
    notify.success(`${app.name} ${enabled ? "enabled" : "disabled"} at startup`, "Reversible from the Restore list.");
    reload();
  };

  const restore = async (id: string) => {
    const c = changes.find((x) => x.id === id);
    if (!c) return;
    const r = await native.startupSetEnabled(id, c.previousEnabled);
    if (r.ok) {
      forget(id);
      notify.success(`${c.name} restored`, `Back to ${c.previousEnabled ? "enabled" : "disabled"}.`);
      reload();
    } else notify.error("Restore failed", r.error);
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-baseline justify-between gap-6">
        <div className="flex flex-wrap gap-x-8 gap-y-1 font-mono text-[12px] tabular text-white/40">
          <span><span className="text-white/85">{apps.length}</span> entries</span>
          <span><span className="text-white/85">{apps.filter((a) => a.enabled).length}</span> enabled</span>
          <span><span className="text-white/85">{apps.filter((a) => a.cls === "protected").length}</span> protected</span>
        </div>
        <p className={cn("flex items-center gap-2 text-micro", canManage ? "text-status-attention/80" : "text-white/30")}>
          <Shield size={11} />
          {canManage ? "management enabled · current-user entries · reversible" : config.isTauri ? "read only · enable startup changes in Settings → System" : "read only · browser preview"}
          {!canManage && config.isTauri && <button onClick={() => { navigate("settings"); setSection("system"); }} className="normal-case tracking-normal text-white/60 hover:text-white">Open settings</button>}
        </p>
      </div>

      {changes.length > 0 && (
        <div className="border-l border-white/20 pl-5">
          <p className="flex items-center gap-2 text-micro text-white/45"><RotateCcw size={11} /> Changes made by NEXUS</p>
          <div className="mt-2 divide-y divide-white/[0.05]">
            {changes.map((c) => (
              <div key={c.id} className="flex items-center gap-4 py-2 text-[13.5px]">
                <span className="flex-1 text-white/80">{c.name}</span>
                <span className="text-[12px] text-white/40">was {c.previousEnabled ? "enabled" : "disabled"}</span>
                <Button size="sm" variant="ghost" onClick={() => void restore(c.id)}>Restore</Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="grid grid-cols-[1fr_90px_110px_56px] gap-4 px-2 pb-2 text-micro text-white/30">
          <span>Entry</span><span>Impact</span><span>Class</span><span className="text-right">On</span>
        </div>
        <div className="rule" />
        {apps.map((app) => {
          const locked = !canManage || app.cls !== "user";
          return (
            <div key={app.id} className="grid grid-cols-[1fr_90px_110px_56px] items-center gap-4 border-b border-white/[0.04] px-2 py-3.5">
              <div className="flex min-w-0 items-center gap-4">
                <Power size={14} className={app.enabled ? "text-white/60" : "text-white/20"} />
                <div className="min-w-0">
                  <p className="truncate text-[14px] text-white/85">{app.name}</p>
                  <p className="truncate font-mono text-[11px] text-white/28" title={app.command}>{app.command}</p>
                  <p className="truncate text-[11px] text-white/30">{app.id.split(":")[0]!.toUpperCase()} · {app.why}</p>
                </div>
              </div>
              <span className={cn("text-[12px] capitalize", app.impact === "high" ? "text-status-warning/80" : app.impact === "medium" ? "text-status-attention/80" : "text-white/45")}>{app.impact}</span>
              <span className={cn("text-[12px]", app.cls === "protected" ? "text-white/40" : app.cls === "read-only" ? "text-white/40" : "text-white/85")}>{app.cls === "protected" ? "Protected" : app.cls === "read-only" ? "Read only" : "User"}</span>
              <div className="flex justify-end">
                {locked ? <span title={app.why} className="text-white/20"><Lock size={13} /></span> : <Toggle checked={app.enabled} disabled={busy === app.id} onChange={(v) => void toggle(app, v)} />}
              </div>
            </div>
          );
        })}
        {apps.length === 0 && <p className="py-10 text-center text-sm text-white/35"><Rocket size={16} className="mx-auto mb-2" />No startup entries found.</p>}
      </div>
    </div>
  );
}
