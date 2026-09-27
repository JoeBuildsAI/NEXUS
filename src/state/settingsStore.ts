import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PrivacyAction = "home" | "minimize";

export interface AppearanceSettings {
  backgroundIntensity: number; // 0-100
  glassIntensity: number; // 0-100
  animationsEnabled: boolean;
  telemetryAnimation: boolean;
  reducedMotion: boolean;
}

export interface StartupSettings {
  launchOnLogin: boolean;
  startMinimized: boolean;
  startupAnimation: boolean;
}

export interface GamingSettings {
  gamingModeEnabled: boolean;
  approvedBackgroundApps: string[];
  defaultLauncher: string;
}

export interface MediaSettings {
  authorizedFolders: string[];
  defaultColumns: number;
  defaultRows: number;
  pauseOnHide: boolean;
}

export interface PrivacySettings {
  /** Global privacy hotkey, in accelerator form. */
  hotkey: string;
  action: PrivacyAction;
  stopPlaybackOnTrigger: boolean;
}

export interface SystemSettings {
  /** "observe" never mutates; "enabled" allows allowlisted actions. */
  safety: "observe" | "enabled";
  allowStartupChanges: boolean;
  allowProcessManagement: boolean;
}

export interface AISettings {
  provider: "local" | "openai" | "anthropic";
  localCommandMode: boolean;
}

interface SettingsState {
  appearance: AppearanceSettings;
  startup: StartupSettings;
  gaming: GamingSettings;
  media: MediaSettings;
  privacy: PrivacySettings;
  system: SystemSettings;
  ai: AISettings;
  setAppearance: (patch: Partial<AppearanceSettings>) => void;
  setStartup: (patch: Partial<StartupSettings>) => void;
  setGaming: (patch: Partial<GamingSettings>) => void;
  setMedia: (patch: Partial<MediaSettings>) => void;
  setPrivacy: (patch: Partial<PrivacySettings>) => void;
  setSystem: (patch: Partial<SystemSettings>) => void;
  setAI: (patch: Partial<AISettings>) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      appearance: {
        backgroundIntensity: 70,
        glassIntensity: 80,
        animationsEnabled: true,
        telemetryAnimation: true,
        reducedMotion: false,
      },
      startup: {
        launchOnLogin: false,
        startMinimized: false,
        startupAnimation: true,
      },
      gaming: {
        gamingModeEnabled: true,
        approvedBackgroundApps: ["Spotify.exe", "Discord.exe"],
        defaultLauncher: "steam",
      },
      media: {
        authorizedFolders: [],
        defaultColumns: 3,
        defaultRows: 2,
        pauseOnHide: true,
      },
      privacy: {
        hotkey: "CommandOrControl+Shift+`",
        action: "home",
        stopPlaybackOnTrigger: true,
      },
      system: {
        safety: "observe",
        allowStartupChanges: false,
        allowProcessManagement: false,
      },
      ai: {
        provider: "local",
        localCommandMode: true,
      },
      setAppearance: (patch) =>
        set((s) => ({ appearance: { ...s.appearance, ...patch } })),
      setStartup: (patch) => set((s) => ({ startup: { ...s.startup, ...patch } })),
      setGaming: (patch) => set((s) => ({ gaming: { ...s.gaming, ...patch } })),
      setMedia: (patch) => set((s) => ({ media: { ...s.media, ...patch } })),
      setPrivacy: (patch) => set((s) => ({ privacy: { ...s.privacy, ...patch } })),
      setSystem: (patch) => set((s) => ({ system: { ...s.system, ...patch } })),
      setAI: (patch) => set((s) => ({ ai: { ...s.ai, ...patch } })),
    }),
    { name: "nexus-settings" },
  ),
);
