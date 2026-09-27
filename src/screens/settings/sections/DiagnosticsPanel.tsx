import { APP_VERSION } from "@/core/version";
import { useState } from "react";
import { Check, ClipboardCopy, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { getProviders } from "@/providers";
import { native } from "@/providers/system/nativeBridge";
import { useSettingsStore } from "@/state/settingsStore";
import { useProcessPrefsStore } from "@/state/processPrefsStore";
import { useMediaLibraryStore } from "@/state/mediaLibraryStore";
import { renderDiagnostics } from "@/core/diagnostics/diagnostics";
import { formatRecentLog } from "@/lib/logger";
import { config } from "@/core/config";
import type { ProviderHealth } from "@/core/types";
import { notify } from "@/state/toastStore";

async function collect(): Promise<string> {
  const p = getProviders();
  const settings = useSettingsStore.getState();
  const hw = await native.hardware();
  const steam = await p.steam.getStatus?.().catch(() => null);
  const providers: Record<string, ProviderHealth> = {};
  const now = Date.now();
  providers.System = { state: config.isTauri ? "available" : "degraded", summary: config.isTauri ? "Live Windows telemetry" : "Demo telemetry", checkedAt: now };
  providers.Steam = (await p.steam.health?.().catch(() => null)) ?? { state: "not-configured", summary: "Demo library", checkedAt: now };
  providers.Media = (await p.media.health?.().catch(() => null)) ?? { state: "not-configured", summary: "Demo library", checkedAt: now };
  providers.Email = { state: "not-configured", summary: "Mock inbox", checkedAt: now };
  providers.AI = { state: "available", summary: "Local command engine", checkedAt: now };
  let autostart: boolean | null = null;
  let hotkey: boolean | null = null;
  if (config.isTauri) {
    try {
      autostart = await (await import("@tauri-apps/plugin-autostart")).isEnabled();
    } catch { autostart = null; }
    try {
      hotkey = await (await import("@tauri-apps/plugin-global-shortcut")).isRegistered(settings.privacy.hotkey);
    } catch { hotkey = null; }
  }
  const roots = useMediaLibraryStore.getState().roots;
  return renderDiagnostics({
    appVersion: APP_VERSION,
    runtime: config.isTauri ? "desktop" : "browser",
    demoMode: config.demoMode,
    os: hw ? { name: hw.osName, version: hw.osVersion, arch: hw.arch } : null,
    providers,
    steam: steam ?? null,
    mediaRootsAuthorized: roots.length,
    mediaRootsReachable: roots.filter((r) => r.exists !== false).length,
    gpu: hw?.gpus[0] ? { name: hw.gpus[0].name, utilizationSupported: hw.gpus[0].utilizationSupported, temperatureSupported: hw.gpus[0].temperatureSupported } : null,
    autostartEnabled: autostart,
    privacyHotkeyRegistered: hotkey,
    systemSafety: settings.system.safety,
    processAllowlistCount: useProcessPrefsStore.getState().closeAllowlist().length,
    environment: settings.appearance.environment,
  }) + ["", "", "Recent log (redacted: secrets, paths)", formatRecentLog(80) || "(empty)"].join("\n");
}

export function DiagnosticsPanel() {
  const { data, loading, reload } = useAsync(collect, []);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data);
      setCopied(true);
      notify.success("Diagnostics copied", "Sanitized — no secrets or media paths included.");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      notify.error("Clipboard unavailable");
    }
  };

  return (
    <div className="py-5">
      <div className="flex items-start justify-between gap-8">
        <div>
          <p className="flex items-center gap-2 text-[15px] text-white/85"><Stethoscope size={14} className="text-white/40" /> Diagnostics</p>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-white/40">Provider states, Steam detection, GPU capability, autostart and hotkey registration. Sanitized: never includes API keys, media paths or history.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={reload}>Refresh</Button>
          <Button size="sm" variant="outline" onClick={() => void copy()} disabled={!data}>{copied ? <Check size={13} /> : <ClipboardCopy size={13} />} Copy diagnostics</Button>
        </div>
      </div>
      <pre className="mt-5 max-h-72 overflow-auto rounded-sm bg-white/[0.02] p-5 font-mono text-[11.5px] leading-relaxed text-white/55" data-selectable="true">
        {loading && !data ? "Collecting…" : data}
      </pre>
    </div>
  );
}
