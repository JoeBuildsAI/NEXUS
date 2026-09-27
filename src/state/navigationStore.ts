import { create } from "zustand";

export type Screen =
  | "home"
  | "gaming"
  | "media"
  | "system"
  | "communications"
  | "settings";

export type BootPhase = "booting" | "ready";
export type SystemTab = "overview" | "hardware" | "processes" | "storage" | "startup";
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

export type CommsSurface = "inbox" | "health" | "subscriptions" | "rules" | "summary";
export type CommsRequest = { surface: CommsSurface; view?: string; sender?: string; query?: string; accountId?: string; seq: number };

export const SCREEN_ORDER: readonly Screen[] = ["home", "gaming", "media", "system", "communications"];

interface NavigationState {
  bootPhase: BootPhase;
  screen: Screen;
  /** Selected game id for the Gaming detail view. */
  selectedGameId: string | null;
  /** Active tab within the System screen. */
  systemTab: SystemTab;
  settingsSection: SettingsSection;
  /** Deep-link into Communications (command palette → view/sender/surface). */
  commsRequest: CommsRequest | null;
  commandPaletteOpen: boolean;
  setBootPhase: (phase: BootPhase) => void;
  navigate: (screen: Screen) => void;
  setSystemTab: (tab: SystemTab) => void;
  setSettingsSection: (section: SettingsSection) => void;
  openCommunications: (req: Omit<CommsRequest, "seq">) => void;
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
  commsRequest: null,
  commandPaletteOpen: false,
  setBootPhase: (bootPhase) => set({ bootPhase }),
  navigate: (screen) => set({ screen, selectedGameId: null }),
  setSystemTab: (systemTab) => set({ systemTab }),
  setSettingsSection: (settingsSection) => set({ settingsSection }),
  openCommunications: (req) => set((st) => ({ screen: "communications", selectedGameId: null, commsRequest: { ...req, seq: (st.commsRequest?.seq ?? 0) + 1 } })),
  selectGame: (selectedGameId) => set({ selectedGameId }),
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  toggleCommandPalette: () =>
    set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
}));
