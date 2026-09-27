import { APP_VERSION } from "@/core/version";
import { useRef, useState } from "react";
import { Download, RotateCcw, Upload } from "lucide-react";
import { SettingsSection, SettingRow, TextInput, Select } from "../SettingsControls";
import { Toggle, Button, Badge } from "@/components/ui";
import { useSettingsStore, type AppearanceSettings, type PrivacySettings, type ShortcutSettings, type StartupSettings, type SystemSettings, type GamingSettings, type AISettings } from "@/state/settingsStore";
import { useProcessPrefsStore } from "@/state/processPrefsStore";
import { useGamePrefsStore } from "@/state/gamePrefsStore";
import { useMediaLibraryStore } from "@/state/mediaLibraryStore";
import { requestConfirm } from "@/state/confirmStore";
import { notify } from "@/state/toastStore";
import { config } from "@/core/config";
import { containsSensitive, createBackup, validateBackup } from "@/core/backup/configBackup";

export function GeneralSettings() {
  const { startup, setStartup, profile, setProfile } = useSettingsStore();
  const [includeRoots, setIncludeRoots] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportConfig = () => {
    const s = useSettingsStore.getState();
    const backup = createBackup({
      appVersion: APP_VERSION,
      settings: { profile: s.profile, appearance: s.appearance as unknown as Record<string, unknown>, startup: s.startup as unknown as Record<string, unknown>, gaming: s.gaming as unknown as Record<string, unknown>, media: { ...s.media }, privacy: s.privacy as unknown as Record<string, unknown>, system: s.system as unknown as Record<string, unknown>, ai: s.ai as unknown as Record<string, unknown>, shortcuts: s.shortcuts as unknown as Record<string, unknown> },
      processPrefs: useProcessPrefsStore.getState().prefs,
      trackedAchievements: useGamePrefsStore.getState().tracked,
      mediaRoots: useMediaLibraryStore.getState().roots.map((r) => r.path),
      includeMediaRoots: includeRoots,
    });
    const json = JSON.stringify(backup, null, 2);
    if (containsSensitive(json)) {
      notify.error("Export blocked", "The export unexpectedly contained a sensitive key.");
      return;
    }
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `nexus-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    notify.success("Configuration exported", includeRoots ? "Includes media root paths." : "No secrets, media paths or history included.");
  };

  const importConfig = async (file: File) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      notify.error("Import failed", "File is not valid JSON.");
      return;
    }
    const v = validateBackup(parsed);
    if (!v.ok) {
      notify.error("Import rejected", v.error);
      return;
    }
    requestConfirm({
      title: "Import configuration?",
      message: `Replaces appearance, hotkeys, mode settings, the process allowlist and tracked achievements with the values from this file (v${v.backup.version}, exported ${v.backup.exportedAt ? new Date(v.backup.exportedAt).toLocaleDateString() : "unknown"}). Secrets and media history are never part of an import.${v.warnings.length ? ` Notes: ${v.warnings.join(" ")}` : ""}`,
      confirmLabel: "Import",
      onConfirm: () => {
        const b = v.backup;
        const s = useSettingsStore.getState();
        if (b.settings.profile.name) s.setProfile({ name: b.settings.profile.name });
        s.setAppearance(b.settings.appearance as Partial<AppearanceSettings>);
        s.setStartup(b.settings.startup as Partial<StartupSettings>);
        s.setGaming(b.settings.gaming as Partial<GamingSettings>);
        s.setMedia(b.settings.media);
        s.setPrivacy(b.settings.privacy as Partial<PrivacySettings>);
        s.setSystem(b.settings.system as Partial<SystemSettings>);
        s.setAI(b.settings.ai as Partial<AISettings>);
        s.setShortcuts(b.settings.shortcuts as Partial<ShortcutSettings>);
        useProcessPrefsStore.setState({ prefs: b.processPrefs });
        useGamePrefsStore.setState({ tracked: b.trackedAchievements });
        notify.success("Configuration imported", b.mediaRoots?.length ? "Re-authorize media folders in Settings → Media." : undefined);
      },
    });
  };

  return (
    <SettingsSection title="General" description="Identity, core behavior, and configuration backup.">
      <SettingRow label="Your name" description="Used for the welcome greeting.">
        <TextInput value={profile.name} onChange={(e) => setProfile({ name: e.target.value })} className="w-44" aria-label="Your name" />
      </SettingRow>
      <SettingRow label="Home subtitle" description="One optional line under the greeting.">
        <TextInput value={profile.subtitle} onChange={(e) => setProfile({ subtitle: e.target.value.slice(0, 80) })} className="w-64" placeholder="None" aria-label="Home subtitle" />
      </SettingRow>
      <SettingRow label="Clock" description="Time format on Home.">
        <Select value={profile.clockFormat} onChange={(v) => setProfile({ clockFormat: v })} options={[{ value: "24h" as const, label: "24-hour" }, { value: "12h" as const, label: "12-hour" }]} />
      </SettingRow>
      <SettingRow label="Launch on login" description="Start NEXUS automatically after you sign in to Windows.">
        <Toggle checked={startup.launchOnLogin} onChange={(v) => setStartup({ launchOnLogin: v })} />
      </SettingRow>
      <SettingRow label="Start minimized" description="Open directly to the system tray on launch.">
        <Toggle checked={startup.startMinimized} onChange={(v) => setStartup({ startMinimized: v })} />
      </SettingRow>
      <SettingRow label="Startup animation" description="Show the cinematic boot sequence.">
        <Toggle checked={startup.startupAnimation} onChange={(v) => setStartup({ startupAnimation: v })} />
      </SettingRow>
      <SettingRow label="Replay onboarding" description="Run the first-run experience (including environment discovery) again.">
        <Button size="sm" variant="outline" onClick={() => setProfile({ onboardingComplete: false })}><RotateCcw size={13} /> Replay</Button>
      </SettingRow>

      <div className="py-5">
        <p className="text-[15px] text-white/85">Backup & restore</p>
        <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-white/40">Versioned JSON with appearance, hotkeys, mode settings, process allowlist, game preferences and tracked achievements. Never includes API secrets, email credentials or private media history.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button size="sm" variant="outline" onClick={exportConfig}><Download size={13} /> Export configuration</Button>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}><Upload size={13} /> Import configuration</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importConfig(f); e.target.value = ""; }} />
          <label className="ml-2 flex items-center gap-2 text-[12.5px] text-white/45">
            <input type="checkbox" checked={includeRoots} onChange={(e) => setIncludeRoots(e.target.checked)} className="accent-white" /> Include media root paths
          </label>
        </div>
      </div>

      <SettingRow label="Runtime" description="How NEXUS is running right now.">
        <div className="flex gap-1.5">
          <Badge tone={config.isTauri ? "nominal" : "neutral"}>{config.isTauri ? "Desktop" : "Browser preview"}</Badge>
          {config.demoMode && <Badge tone="accent">Demo fallback on</Badge>}
        </div>
      </SettingRow>
    </SettingsSection>
  );
}
