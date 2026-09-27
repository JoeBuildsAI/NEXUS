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

interface NavigationState {
  bootPhase: BootPhase;
  screen: Screen;
  /** Selected game id for the Gaming detail view. */
  selectedGameId: string | null;
  /** Active tab within the System screen. */
  systemTab: SystemTab;
  commandPaletteOpen: boolean;
  setBootPhase: (phase: BootPhase) => void;
  navigate: (screen: Screen) => void;
  setSystemTab: (tab: SystemTab) => void;
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
  commandPaletteOpen: false,
  setBootPhase: (bootPhase) => set({ bootPhase }),
  navigate: (screen) => set({ screen, selectedGameId: null }),
  setSystemTab: (systemTab) => set({ systemTab }),
  selectGame: (selectedGameId) => set({ selectedGameId }),
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  toggleCommandPalette: () =>
    set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
}));
