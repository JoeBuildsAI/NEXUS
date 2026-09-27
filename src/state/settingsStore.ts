import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PrivacyAction = "home" | "minimize" | "tray";
export type EnvironmentPreset = "nexus" | "void" | "aurora" | "neural" | "minimal";
export type BackgroundPerformance = "full" | "balanced" | "minimal";

export interface ProfileSettings {
  name: string;
  onboardingComplete: boolean;
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
  clearWorkspaceOnTrigger: boolean;
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

export interface ShortcutSettings {
  commandPalette: string;
  privacy: string;
  screenPrefix: "ctrl" | "alt";
  screenShortcutsEnabled: boolean;
}

interface SettingsState {
  profile: ProfileSettings;
  appearance: AppearanceSettings;
  startup: StartupSettings;
  gaming: GamingSettings;
  media: MediaSettings;
  privacy: PrivacySettings;
  system: SystemSettings;
  ai: AISettings;
  shortcuts: ShortcutSettings;
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
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      profile: { name: "Joseph", onboardingComplete: false },
      appearance: DEFAULT_APPEARANCE,
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
        clearWorkspaceOnTrigger: false,
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
      shortcuts: {
        commandPalette: "Ctrl+Space",
        privacy: "Ctrl+Shift+`",
        screenPrefix: "ctrl",
        screenShortcutsEnabled: true,
      },
      devPanelOpen: false,
      setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
      setAppearance: (patch) =>
        set((s) => ({ appearance: { ...s.appearance, ...patch } })),
      setStartup: (patch) => set((s) => ({ startup: { ...s.startup, ...patch } })),
      setGaming: (patch) => set((s) => ({ gaming: { ...s.gaming, ...patch } })),
      setMedia: (patch) => set((s) => ({ media: { ...s.media, ...patch } })),
      setPrivacy: (patch) => set((s) => ({ privacy: { ...s.privacy, ...patch } })),
      setSystem: (patch) => set((s) => ({ system: { ...s.system, ...patch } })),
      setAI: (patch) => set((s) => ({ ai: { ...s.ai, ...patch } })),
      setShortcuts: (patch) => set((s) => ({ shortcuts: { ...s.shortcuts, ...patch } })),
      setDevPanelOpen: (devPanelOpen) => set({ devPanelOpen }),
    }),
    {
      name: "nexus-settings",
      version: 2,
      partialize: (s) => {
        // Never persist transient dev panel visibility.
        const { devPanelOpen: _d, ...rest } = s;
        return rest as SettingsState;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          ...p,
          profile: { ...current.profile, ...p.profile },
          appearance: { ...current.appearance, ...p.appearance },
          startup: { ...current.startup, ...p.startup },
          gaming: { ...current.gaming, ...p.gaming },
          media: { ...current.media, ...p.media },
          privacy: { ...current.privacy, ...p.privacy },
          system: { ...current.system, ...p.system },
          ai: { ...current.ai, ...p.ai },
          shortcuts: { ...current.shortcuts, ...p.shortcuts },
          devPanelOpen: false,
        };
      },
    },
  ),
);
