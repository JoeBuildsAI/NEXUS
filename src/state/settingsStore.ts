import { create } from "zustand";
import { persist } from "zustand/middleware";
import { safeStorage } from "./persistence";
import { sanitizeSettings, SETTINGS_VERSION, type SettingsData } from "./settingsSchema";

export type PrivacyAction = "home" | "minimize" | "tray";
export type EnvironmentPreset = "nexus" | "void" | "aurora" | "neural" | "minimal";
export type BackgroundPerformance = "full" | "balanced" | "minimal";

export interface ProfileSettings {
  name: string;
  onboardingComplete: boolean;
  /** Optional one-line Home subtitle. Empty = none. */
  subtitle: string;
  clockFormat: "24h" | "12h";
}

export interface AppearanceSettings {
  environment: EnvironmentPreset;
  backgroundPerformance: BackgroundPerformance;
  backgroundIntensity: number; // 0-100
  glassIntensity: number; // 0-100
  animationsEnabled: boolean;
  telemetryAnimation: boolean;
  reducedMotion: boolean;
  cursorLighting: boolean;
  /** Explicitly selected local image shown behind the environment (asset URL), or null. */
  backgroundImage: string | null;
}

export interface StartupSettings {
  launchOnLogin: boolean;
  startMinimized: boolean;
  startupAnimation: boolean;
}

export interface GamingSettings {
  gamingModeEnabled: boolean;
  approvedBackgroundApps: string[];
  defaultLauncher: "steam" | "epic" | "gog" | "xbox";
}

export interface MediaSettings {
  authorizedFolders: string[];
  defaultColumns: number;
  defaultRows: number;
  pauseOnHide: boolean;
  /** Generate local thumbnails (Windows Shell; cached locally only). */
  thumbnails: boolean;
  /** Restore the saved workspace structure on launch (never auto-plays). */
  restoreWorkspace: boolean;
}

export interface PrivacySettings {
  /** Global privacy hotkey, in accelerator form. */
  hotkey: string;
  action: PrivacyAction;
  stopPlaybackOnTrigger: boolean;
  clearWorkspaceOnTrigger: boolean;
}

export interface SystemSettings {
  /** "observe" never mutates; "enabled" allows allowlisted actions. */
  safety: "observe" | "enabled";
  allowStartupChanges: boolean;
  allowProcessManagement: boolean;
  /** Keep a local, private activity history (game sessions, modes, cleanup). */
  activityHistory: boolean;
  /** Manually chosen primary GPU (adapter LUID) when auto-detection is ambiguous. */
  preferredGpu: string | null;
}

export interface AISettings {
  provider: "local" | "openai" | "anthropic";
  localCommandMode: boolean;
  /** Optional inbox intelligence: what may leave the machine. Default off. */
  inboxMode: "off" | "metadata" | "selected" | "full";
}

export interface ShortcutSettings {
  commandPalette: string;
  privacy: string;
  screenPrefix: "ctrl" | "alt";
  screenShortcutsEnabled: boolean;
}

export interface LifeSettings {
  /** Local reminders (in-app, and system notifications when permitted). */
  reminders: boolean;
  remindEvents: boolean;
  remindWorkouts: boolean;
  remindRoutines: boolean;
  remindMeals: boolean;
  remindTasks: boolean;
  /** Minutes before an event to remind. */
  leadMinutes: number;
  /** Quiet hours: no reminders between these minutes of day (start may be > end, crossing midnight). */
  quietStart: number;
  quietEnd: number;
  /** Default workout slot when a program schedules a session without a calendar event. */
  workoutMinute: number;
}
export interface DataSettings {
  autoBackup: boolean;
  keepBackups: number;
  lastAutoBackupDay: string | null;
}

export interface WindowSettings {
  /** What the titlebar close button does. */
  closeBehavior: "tray" | "exit";
}

interface SettingsState extends SettingsData {
  /** Developer panel visibility (dev builds only). */
  devPanelOpen: boolean;
  setProfile: (patch: Partial<ProfileSettings>) => void;
  setAppearance: (patch: Partial<AppearanceSettings>) => void;
  setStartup: (patch: Partial<StartupSettings>) => void;
  setGaming: (patch: Partial<GamingSettings>) => void;
  setMedia: (patch: Partial<MediaSettings>) => void;
  setPrivacy: (patch: Partial<PrivacySettings>) => void;
  setSystem: (patch: Partial<SystemSettings>) => void;
  setAI: (patch: Partial<AISettings>) => void;
  setShortcuts: (patch: Partial<ShortcutSettings>) => void;
  setWindow: (patch: Partial<WindowSettings>) => void;
  setLife: (patch: Partial<LifeSettings>) => void;
  setData: (patch: Partial<DataSettings>) => void;
  setDevPanelOpen: (open: boolean) => void;
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  environment: "nexus",
  backgroundPerformance: "balanced",
  backgroundIntensity: 70,
  glassIntensity: 80,
  animationsEnabled: true,
  telemetryAnimation: true,
  reducedMotion: false,
  cursorLighting: true,
  backgroundImage: null,
};

export const DEFAULT_SETTINGS: SettingsData = {
  profile: { name: "Joseph", onboardingComplete: false, subtitle: "", clockFormat: "24h" },
  appearance: DEFAULT_APPEARANCE,
  startup: { launchOnLogin: false, startMinimized: false, startupAnimation: true },
  gaming: { gamingModeEnabled: true, approvedBackgroundApps: ["Spotify.exe", "Discord.exe"], defaultLauncher: "steam" },
  media: { authorizedFolders: [], defaultColumns: 3, defaultRows: 2, pauseOnHide: true, thumbnails: true, restoreWorkspace: true },
  privacy: { hotkey: "CommandOrControl+Shift+`", action: "home", stopPlaybackOnTrigger: true, clearWorkspaceOnTrigger: false },
  system: { safety: "observe", allowStartupChanges: false, allowProcessManagement: false, activityHistory: true, preferredGpu: null },
  ai: { provider: "local", localCommandMode: true, inboxMode: "off" },
  shortcuts: { commandPalette: "Ctrl+Space", privacy: "Ctrl+Shift+`", screenPrefix: "ctrl", screenShortcutsEnabled: true },
  window: { closeBehavior: "tray" },
  life: { reminders: false, remindEvents: true, remindWorkouts: true, remindRoutines: true, remindMeals: false, remindTasks: true, leadMinutes: 10, quietStart: 22 * 60, quietEnd: 7 * 60, workoutMinute: 17 * 60 + 30 },
  data: { autoBackup: false, keepBackups: 7, lastAutoBackupDay: null },
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      devPanelOpen: false,
      setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
      setAppearance: (patch) => set((s) => ({ appearance: { ...s.appearance, ...patch } })),
      setStartup: (patch) => set((s) => ({ startup: { ...s.startup, ...patch } })),
      setGaming: (patch) => set((s) => ({ gaming: { ...s.gaming, ...patch } })),
      setMedia: (patch) => set((s) => ({ media: { ...s.media, ...patch } })),
      setPrivacy: (patch) => set((s) => ({ privacy: { ...s.privacy, ...patch } })),
      setSystem: (patch) => set((s) => ({ system: { ...s.system, ...patch } })),
      setAI: (patch) => set((s) => ({ ai: { ...s.ai, ...patch } })),
      setShortcuts: (patch) => set((s) => ({ shortcuts: { ...s.shortcuts, ...patch } })),
      setWindow: (patch) => set((s) => ({ window: { ...s.window, ...patch } })),
      setLife: (patch) => set((s) => ({ life: { ...s.life, ...patch } })),
      setData: (patch) => set((s) => ({ data: { ...s.data, ...patch } })),
      setDevPanelOpen: (devPanelOpen) => set({ devPanelOpen }),
    }),
    {
      name: "nexus-settings",
      version: SETTINGS_VERSION,
      storage: safeStorage(),
      partialize: (s) => {
        const { devPanelOpen: _d, ...rest } = s;
        return rest as SettingsState;
      },
      // Any persisted shape (older versions, partial, corrupted values) is coerced to valid settings.
      migrate: (persisted) => sanitizeSettings(persisted, DEFAULT_SETTINGS) as unknown as SettingsState,
      merge: (persisted, current) => ({ ...current, ...sanitizeSettings(persisted, DEFAULT_SETTINGS), devPanelOpen: false }),
    },
  ),
);
