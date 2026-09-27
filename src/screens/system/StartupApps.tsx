import { useMemo, useState } from "react";
import { Lock, Power, RotateCcw, Rocket, Shield } from "lucide-react";
import { Badge, Toggle, Button } from "@/components/ui";
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

const IMPACT_TONE = { low: "nominal", medium: "attention", high: "warning", unknown: "neutral" } as const;

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
    <div className="space-y-6">
      <div className={cn("flex items-center gap-2 text-xs", canManage ? "text-status-attention" : "text-white/40")}>
        <Shield size={13} />
        {canManage
          ? "Startup management enabled — only current-user entries can be toggled; every change is recorded and reversible."
          : config.isTauri
            ? "Read-only. Enable “Allow startup changes” under Settings → System (with safety enabled) to manage entries."
            : "Read-only in browser preview. The desktop build reads real Run keys and Startup folders."}
        {!canManage && config.isTauri && <button onClick={() => { navigate("settings"); setSection("system"); }} className="text-accent hover:underline">Open settings</button>}
      </div>

      {changes.length > 0 && (
        <div className="rounded-xl border border-accent/20 bg-accent/[0.04] p-4">
          <p className="flex items-center gap-2 text-[10px] uppercase tracking-wide2 text-accent/70"><RotateCcw size={12} /> Changes made by NEXUS</p>
          <div className="mt-2 divide-y divide-white/[0.05]">
            {changes.map((c) => (
              <div key={c.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="flex-1 text-white/80">{c.name}</span>
                <span className="text-xs text-white/40">was {c.previousEnabled ? "enabled" : "disabled"}</span>
                <Button size="sm" variant="outline" onClick={() => void restore(c.id)}>Restore</Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="divide-y divide-white/[0.04]">
        <div className="grid grid-cols-[1fr_110px_130px_60px] gap-3 px-2 pb-2 text-[10px] uppercase tracking-wide2 text-white/30">
          <span>Entry</span><span>Impact</span><span>Classification</span><span className="text-right">On</span>
        </div>
        {apps.map((app) => {
          const locked = !canManage || app.cls !== "user";
          return (
            <div key={app.id} className="grid grid-cols-[1fr_110px_130px_60px] items-center gap-3 px-2 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-white/40"><Power size={15} /></span>
                <div className="min-w-0">
                  <p className="truncate text-sm text-white/85">{app.name}</p>
                  <p className="truncate font-mono text-[11px] text-white/30" title={app.command}>{app.command}</p>
                  <p className="truncate text-[11px] text-white/30">{app.id.split(":")[0]!.toUpperCase()} · {app.why}</p>
                </div>
              </div>
              <span><Badge tone={IMPACT_TONE[app.impact]}>{app.impact}</Badge></span>
              <span><Badge tone={app.cls === "protected" ? "critical" : app.cls === "read-only" ? "neutral" : "accent"}>{app.cls === "protected" ? "Protected" : app.cls === "read-only" ? "Read only" : "User"}</Badge></span>
              <div className="flex justify-end">
                {locked ? (
                  <span title={app.why} className="text-white/25"><Lock size={14} /></span>
                ) : (
                  <Toggle checked={app.enabled} disabled={busy === app.id} onChange={(v) => void toggle(app, v)} />
                )}
              </div>
            </div>
          );
        })}
        {apps.length === 0 && <p className="py-8 text-center text-sm text-white/35"><Rocket size={16} className="mx-auto mb-2" />No startup entries found.</p>}
      </div>
    </div>
  );
}
