import { isObj, isStr, vArr, vBool, vNum, vOneOf, vStr } from "./persistence";
import type {
  AISettings, AppearanceSettings, GamingSettings, MediaSettings, PrivacySettings, ProfileSettings,
  ShortcutSettings, StartupSettings, SystemSettings, WindowSettings,
} from "./settingsStore";

export interface SettingsData {
  profile: ProfileSettings;
  appearance: AppearanceSettings;
  startup: StartupSettings;
  gaming: GamingSettings;
  media: MediaSettings;
  privacy: PrivacySettings;
  system: SystemSettings;
  ai: AISettings;
  shortcuts: ShortcutSettings;
  window: WindowSettings;
}

export const SETTINGS_VERSION = 3;

/** Coerce anything persisted (any version, any corruption) into valid settings. */
export function sanitizeSettings(persisted: unknown, defaults: SettingsData): SettingsData {
  const p = isObj(persisted) ? persisted : {};
  const sec = (k: keyof SettingsData): Record<string, unknown> => (isObj(p[k]) ? (p[k] as Record<string, unknown>) : {});
  const d = defaults;
  const a = sec("appearance"), pr = sec("profile"), st = sec("startup"), g = sec("gaming"), m = sec("media"), pv = sec("privacy"), sy = sec("system"), ai = sec("ai"), sh = sec("shortcuts"), w = sec("window");
  return {
    profile: {
      name: vStr(pr.name, d.profile.name, 40),
      onboardingComplete: vBool(pr.onboardingComplete, d.profile.onboardingComplete),
      subtitle: vStr(pr.subtitle, d.profile.subtitle, 80),
      clockFormat: vOneOf(pr.clockFormat, ["24h", "12h"], d.profile.clockFormat),
    },
    appearance: {
      environment: vOneOf(a.environment, ["nexus", "void", "aurora", "neural", "minimal"], d.appearance.environment),
      backgroundPerformance: vOneOf(a.backgroundPerformance, ["full", "balanced", "minimal"], d.appearance.backgroundPerformance),
      backgroundIntensity: vNum(a.backgroundIntensity, d.appearance.backgroundIntensity, 0, 100),
      glassIntensity: vNum(a.glassIntensity, d.appearance.glassIntensity, 0, 100),
      animationsEnabled: vBool(a.animationsEnabled, d.appearance.animationsEnabled),
      telemetryAnimation: vBool(a.telemetryAnimation, d.appearance.telemetryAnimation),
      reducedMotion: vBool(a.reducedMotion, d.appearance.reducedMotion),
      cursorLighting: vBool(a.cursorLighting, d.appearance.cursorLighting),
      backgroundImage: typeof a.backgroundImage === "string" ? a.backgroundImage.slice(0, 1024) : null,
    },
    startup: {
      launchOnLogin: vBool(st.launchOnLogin, d.startup.launchOnLogin),
      startMinimized: vBool(st.startMinimized, d.startup.startMinimized),
      startupAnimation: vBool(st.startupAnimation, d.startup.startupAnimation),
    },
    gaming: {
      gamingModeEnabled: vBool(g.gamingModeEnabled, d.gaming.gamingModeEnabled),
      approvedBackgroundApps: vArr(g.approvedBackgroundApps, isStr, d.gaming.approvedBackgroundApps, 200),
      defaultLauncher: vOneOf(g.defaultLauncher, ["steam", "epic", "gog", "xbox"], d.gaming.defaultLauncher),
    },
    media: {
      authorizedFolders: vArr(m.authorizedFolders, isStr, d.media.authorizedFolders, 50),
      defaultColumns: vNum(m.defaultColumns, d.media.defaultColumns, 1, 4),
      defaultRows: vNum(m.defaultRows, d.media.defaultRows, 1, 3),
      pauseOnHide: vBool(m.pauseOnHide, d.media.pauseOnHide),
      thumbnails: vBool(m.thumbnails, d.media.thumbnails),
      restoreWorkspace: vBool(m.restoreWorkspace, d.media.restoreWorkspace),
    },
    privacy: {
      hotkey: vStr(pv.hotkey, d.privacy.hotkey, 60),
      action: vOneOf(pv.action, ["home", "minimize", "tray"], d.privacy.action),
      stopPlaybackOnTrigger: vBool(pv.stopPlaybackOnTrigger, d.privacy.stopPlaybackOnTrigger),
      clearWorkspaceOnTrigger: vBool(pv.clearWorkspaceOnTrigger, d.privacy.clearWorkspaceOnTrigger),
    },
    system: {
      safety: vOneOf(sy.safety, ["observe", "enabled"], d.system.safety),
      allowStartupChanges: vBool(sy.allowStartupChanges, d.system.allowStartupChanges),
      allowProcessManagement: vBool(sy.allowProcessManagement, d.system.allowProcessManagement),
      activityHistory: vBool(sy.activityHistory, d.system.activityHistory),
    },
    ai: {
      provider: vOneOf(ai.provider, ["local", "openai", "anthropic"], d.ai.provider),
      localCommandMode: vBool(ai.localCommandMode, d.ai.localCommandMode),
    },
    shortcuts: {
      commandPalette: vStr(sh.commandPalette, d.shortcuts.commandPalette, 40),
      privacy: vStr(sh.privacy, d.shortcuts.privacy, 40),
      screenPrefix: vOneOf(sh.screenPrefix, ["ctrl", "alt"], d.shortcuts.screenPrefix),
      screenShortcutsEnabled: vBool(sh.screenShortcutsEnabled, d.shortcuts.screenShortcutsEnabled),
    },
    window: {
      closeBehavior: vOneOf(w.closeBehavior, ["tray", "exit"], d.window.closeBehavior),
    },
  };
}
