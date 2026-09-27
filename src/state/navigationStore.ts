import { create } from "zustand";

export type Screen =
  | "home"
  | "gaming"
  | "media"
  | "system"
  | "communications"
  | "settings";

export type BootPhase = "booting" | "ready";
export type SystemTab = "overview" | "processes" | "storage" | "startup";
export type SettingsSection =
  | "general"
  | "appearance"
  | "startup"
  | "gaming"
  | "media"
  | "privacy"
  | "system"
  | "shortcuts"
  | "integrations"
  | "ai";

export const SCREEN_ORDER: readonly Screen[] = ["home", "gaming", "media", "system", "communications"];

interface NavigationState {
  bootPhase: BootPhase;
  screen: Screen;
  /** Selected game id for the Gaming detail view. */
  selectedGameId: string | null;
  /** Active tab within the System screen. */
  systemTab: SystemTab;
  settingsSection: SettingsSection;
  commandPaletteOpen: boolean;
  setBootPhase: (phase: BootPhase) => void;
  navigate: (screen: Screen) => void;
  setSystemTab: (tab: SystemTab) => void;
  setSettingsSection: (section: SettingsSection) => void;
  selectGame: (gameId: string | null) => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  bootPhase: "booting",
  screen: "home",
  selectedGameId: null,
  systemTab: "overview",
  settingsSection: "general",
  commandPaletteOpen: false,
  setBootPhase: (bootPhase) => set({ bootPhase }),
  navigate: (screen) => set({ screen, selectedGameId: null }),
  setSystemTab: (systemTab) => set({ systemTab }),
  setSettingsSection: (settingsSection) => set({ settingsSection }),
  selectGame: (selectedGameId) => set({ selectedGameId }),
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  toggleCommandPalette: () =>
    set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
}));
