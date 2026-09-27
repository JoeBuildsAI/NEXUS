import { useState } from "react";
import { AppWindow, Check, Gamepad2, HardDrive, KeyRound, Mail, RefreshCw, Trash2, Bot, MonitorCog } from "lucide-react";
import { SettingsSection, SettingRow } from "../SettingsControls";
import { Badge, Button } from "@/components/ui";
import { config } from "@/core/config";
import { useDevStore } from "@/state/devStore";
import { useAsync } from "@/hooks/useAsync";
import { getProviders } from "@/providers";
import { native } from "@/providers/system/nativeBridge";
import { notify } from "@/state/toastStore";
import type { ProviderHealth, ProviderHealthState, SteamStatus } from "@/core/types";
import { cn } from "@/lib/utils";
import { MailAccountsPanel } from "./MailAccountsPanel";

const STATE_TONE: Record<ProviderHealthState, "nominal" | "warning" | "neutral" | "attention" | "critical"> = {
  available: "nominal",
  unavailable: "warning",
  "not-configured": "neutral",
  degraded: "attention",
  error: "critical",
};
const STATE_LABEL: Record<ProviderHealthState, string> = {
  available: "AVAILABLE",
  unavailable: "UNAVAILABLE",
  "not-configured": "NOT CONFIGURED",
  degraded: "DEGRADED",
  error: "ERROR",
};

export function IntegrationsSettings() {
  const dev = useDevStore();
  const { data: apps } = useAsync(() => getProviders().apps.getApps(), []);
  const { data: steamStatus, reload: reloadSteam } = useAsync<SteamStatus | null>(() => getProviders().steam.getStatus?.() ?? Promise.resolve(null), [dev.steamConnected]);
  const { data: health, reload: reloadHealth } = useAsync(() => collectHealth(), [dev.steamConnected, dev.mediaConnected, dev.emailConnected, steamStatus?.apiConfigured]);

  return (
    <SettingsSection title="Integrations" description="Connected services and provider health. Credentials live in Windows Credential Manager and are never written to disk by NEXUS.">
      {/* Provider health */}
      <div className="py-4">
        <p className="text-[10px] uppercase tracking-cinematic text-white/30">Provider health</p>
        <div className="mt-3 divide-y divide-white/[0.04]">
          {(health ?? []).map((h) => (
            <div key={h.name} className="flex items-center gap-3 py-2.5">
              <span className="text-white/40">{h.icon}</span>
              <span className="w-24 text-sm text-white/80">{h.name}</span>
              <Badge tone={STATE_TONE[h.health.state]}>{STATE_LABEL[h.health.state]}</Badge>
              <span className="min-w-0 flex-1 truncate text-xs text-white/45">{h.health.summary}{h.health.detail ? ` — ${h.health.detail}` : ""}</span>
            </div>
          ))}
        </div>
      </div>

      <SteamPanel status={steamStatus} onChanged={() => { reloadSteam(); reloadHealth(); }} />

      <SettingRow label="Media root" description="Authorized local folder or drive for the media workspace. Managed in Settings → Media.">
        <div className="flex items-center gap-2"><HardDrive size={15} className="text-white/40" /><Badge tone={dev.mediaConnected ? "accent" : "warning"}>{health?.find((h) => h.name === "Media")?.health.summary ?? "…"}</Badge></div>
      </SettingRow>
      <MailAccountsPanel onChanged={reloadHealth} />
      <SettingRow label="Windows applications" description={config.isTauri ? "Discovered from the Start Menu and Windows built-ins. No disk scanning." : "Demo list in browser preview."}>
        <div className="flex items-center gap-2"><AppWindow size={15} className="text-white/40" /><Badge tone={config.isTauri ? "nominal" : "neutral"}>{apps ? `${apps.length} apps` : "…"}</Badge></div>
      </SettingRow>
    </SettingsSection>
  );
}

async function collectHealth(): Promise<{ name: string; icon: React.ReactNode; health: ProviderHealth }[]> {
  const p = getProviders();
  const now = Date.now();
  const dev = useDevStore.getState();
  const safe = async (fn: (() => Promise<ProviderHealth>) | undefined, fallback: ProviderHealth): Promise<ProviderHealth> => {
    try {
      return fn ? await fn() : fallback;
    } catch (e) {
      return { state: "error", summary: "Health check failed", detail: String((e as Error).message ?? e), checkedAt: now };
    }
  };
  const systemHealth: ProviderHealth = config.isTauri
    ? { state: "available", summary: "Live Windows telemetry", checkedAt: now }
    : { state: "degraded", summary: "Demo telemetry (browser preview)", checkedAt: now };
  return [
    { name: "System", icon: <MonitorCog size={15} />, health: systemHealth },
    { name: "Steam", icon: <Gamepad2 size={15} />, health: await safe(p.steam.health?.bind(p.steam), { state: dev.steamConnected ? "available" : "unavailable", summary: dev.steamConnected ? "Demo library" : "Offline (simulated)", checkedAt: now }) },
    { name: "Media", icon: <HardDrive size={15} />, health: await safe(p.media.health?.bind(p.media), { state: "available", summary: "Demo library", checkedAt: now }) },
    { name: "Email", icon: <Mail size={15} />, health: await safe(p.email.health?.bind(p.email), { state: dev.emailConnected ? "not-configured" : "unavailable", summary: dev.emailConnected ? "Demo inbox · no account connected" : "Disconnected (simulated)", checkedAt: now }) },
    { name: "AI", icon: <Bot size={15} />, health: { state: "available", summary: "Local command engine · deterministic", checkedAt: now } },
  ];
}

function SteamPanel({ status, onChanged }: { status: SteamStatus | null; onChanged: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [steamId, setSteamId] = useState("");
  const [saving, setSaving] = useState(false);
  const desktop = config.isTauri;

  const save = async () => {
    setSaving(true);
    try {
      const results: string[] = [];
      if (apiKey.trim()) {
        const r = await native.secretSet("steam.apiKey", apiKey.trim());
        if (!r.ok) throw new Error(r.error);
        results.push("API key");
      }
      if (steamId.trim()) {
        if (!/^\d{17}$/.test(steamId.trim())) throw new Error("SteamID64 must be 17 digits.");
        const r = await native.secretSet("steam.steamId", steamId.trim());
        if (!r.ok) throw new Error(r.error);
        results.push("SteamID");
      }
      if (results.length === 0) return;
      setApiKey("");
      setSteamId("");
      getProviders().steam.invalidate?.();
      notify.success("Steam credentials saved", `${results.join(" and ")} stored in Windows Credential Manager.`);
      onChanged();
    } catch (e) {
      notify.error("Could not save", String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    await native.secretDelete("steam.apiKey");
    await native.secretDelete("steam.steamId");
    getProviders().steam.invalidate?.();
    notify.neutral("Steam credentials removed");
    onChanged();
  };

  const connected = !!status?.apiConfigured && !!status?.steamIdConfigured;

  return (
    <div className="py-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm text-white/85"><Gamepad2 size={15} className="text-white/40" /> Steam</p>
          <p className="mt-0.5 text-xs text-white/40">Installation is detected locally through the Windows registry and library manifests. Achievements and playtime need the Steam Web API.</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onChanged} title="Re-detect"><RefreshCw size={13} /></Button>
      </div>

      <dl className="mt-4 grid grid-cols-[140px_1fr] gap-y-2 text-sm">
        <dt className="text-white/35">Installation</dt>
        <dd>{status ? <Badge tone={status.detected ? "nominal" : "warning"}>{status.detected ? "DETECTED" : "NOT DETECTED"}</Badge> : <span className="text-white/30">…</span>}</dd>
        <dt className="text-white/35">Steam path</dt>
        <dd className="truncate font-mono text-xs text-white/70" data-selectable="true">{status?.steamPath ?? (status?.detected === false ? "—" : "…")}</dd>
        <dt className="text-white/35">Libraries</dt>
        <dd className="text-white/70">{status ? `${status.libraries}` : "…"}{status && status.malformedManifests > 0 && <span className="ml-2 text-xs text-status-attention">{status.malformedManifests} unreadable manifest{status.malformedManifests === 1 ? "" : "s"}</span>}</dd>
        <dt className="text-white/35">Installed games</dt>
        <dd className="text-white/70">{status ? status.installedGames : "…"}</dd>
        <dt className="text-white/35">Account integration</dt>
        <dd className="flex items-center gap-2">
          <Badge tone={connected ? "nominal" : "neutral"}>{connected ? "CONNECTED" : "NOT CONFIGURED"}</Badge>
          <span className="text-xs text-white/40">{status?.apiConfigured ? "API key ✓" : "API key —"} · {status?.steamIdConfigured ? "SteamID ✓" : "SteamID —"}</span>
        </dd>
      </dl>

      <div className={cn("mt-8 border-t border-white/[0.06] pt-5", !desktop && "opacity-70")}>
        <p className="flex items-center gap-2 text-micro text-white/45"><KeyRound size={11} /> Web API configuration</p>
        <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-white/35">
          Get a key at steamcommunity.com/dev/apikey and your SteamID64 from your profile URL. Stored in Windows Credential Manager — never in settings files, localStorage, or logs, and never shown again after saving.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={status?.apiConfigured ? "API key (configured — enter to replace)" : "Steam Web API key"} disabled={!desktop} className="h-9 border-b border-white/12 bg-transparent font-mono text-sm text-white/90 placeholder:text-white/25 focus:border-white/60 focus:outline-none disabled:opacity-40" />
          <input inputMode="numeric" autoComplete="off" value={steamId} onChange={(e) => setSteamId(e.target.value)} placeholder={status?.steamIdConfigured ? "SteamID64 (configured — enter to replace)" : "SteamID64 (17 digits)"} disabled={!desktop} className="h-9 border-b border-white/12 bg-transparent font-mono text-sm text-white/90 placeholder:text-white/25 focus:border-white/60 focus:outline-none disabled:opacity-40" />
        </div>
        <div className="mt-5 flex items-center gap-3">
          <Button size="sm" variant="primary" disabled={!desktop || saving || (!apiKey.trim() && !steamId.trim())} onClick={() => void save()}><Check size={13} /> Save securely</Button>
          {(status?.apiConfigured || status?.steamIdConfigured) && <Button size="sm" variant="ghost" onClick={() => void clear()}><Trash2 size={13} /> Remove</Button>}
          {!desktop && <span className="text-xs text-white/35">Secure storage requires the desktop build.</span>}
        </div>
      </div>
    </div>
  );
}
