import { APP_VERSION } from "@/core/version";
import { useRef, useState } from "react";
import { Download, RotateCcw, Upload } from "lucide-react";
import { SettingsSection, SettingRow, TextInput, Select } from "../SettingsControls";
import { Toggle, Button, Badge } from "@/components/ui";
import { useSettingsStore } from "@/state/settingsStore";
import { sanitizeSettings } from "@/state/settingsSchema";
import { useProcessPrefsStore } from "@/state/processPrefsStore";
import { useGamePrefsStore } from "@/state/gamePrefsStore";
import { useMediaLibraryStore } from "@/state/mediaLibraryStore";
import { requestConfirm } from "@/state/confirmStore";
import { notify } from "@/state/toastStore";
import { config } from "@/core/config";
import { containsSensitive, createBackup, validateBackup } from "@/core/backup/configBackup";
import { activity } from "@/state/activityStore";

export function GeneralSettings() {
  const { startup, setStartup, profile, setProfile, window: win, setWindow } = useSettingsStore();
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
        // Imported files are untrusted input: coerce through the same schema as hydration.
        const current = { profile: s.profile, appearance: s.appearance, startup: s.startup, gaming: s.gaming, media: s.media, privacy: s.privacy, system: s.system, ai: s.ai, shortcuts: s.shortcuts, window: s.window, life: s.life, data: s.data };
        const clean = sanitizeSettings({ ...current, ...b.settings, profile: { ...current.profile, name: b.settings.profile.name || current.profile.name }, window: current.window }, current);
        s.setProfile({ name: clean.profile.name, subtitle: clean.profile.subtitle, clockFormat: clean.profile.clockFormat });
        s.setAppearance(clean.appearance);
        s.setStartup(clean.startup);
        s.setGaming(clean.gaming);
        s.setMedia({ ...clean.media, authorizedFolders: current.media.authorizedFolders });
        s.setPrivacy(clean.privacy);
        s.setSystem({ ...clean.system, preferredGpu: current.system.preferredGpu });
        s.setAI(clean.ai);
        s.setShortcuts(clean.shortcuts);
        useProcessPrefsStore.setState({ prefs: Object.fromEntries(Object.entries(b.processPrefs).filter(([k, p]) => typeof k === "string" && k.length < 120 && ["normal", "never", "close", "suspend"].includes(String(p))).slice(0, 500)) });
        useGamePrefsStore.setState({ tracked: b.trackedAchievements.filter((t) => t && typeof t.gameId === "string" && typeof t.achievementId === "string").slice(0, 50) });
        notify.success("Configuration imported", b.mediaRoots?.length ? "Re-authorize media folders in Settings → Media." : undefined);
        activity.record("config-imported", `Imported configuration (format v${b.version})`);
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
      <SettingRow label="Close button" description="Minimize to the tray and keep running, or exit NEXUS.">
        <Select value={win.closeBehavior} onChange={(v) => setWindow({ closeBehavior: v })} options={[{ value: "tray" as const, label: "Minimize to tray" }, { value: "exit" as const, label: "Exit NEXUS" }]} />
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
