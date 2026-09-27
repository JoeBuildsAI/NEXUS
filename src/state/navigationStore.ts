import { create } from "zustand";

export type Screen =
  | "home"
  | "calendar"
  | "life"
  | "gaming"
  | "media"
  | "system"
  | "communications"
  | "settings";

export type LifeSection = "overview" | "week" | "routines" | "fitness" | "nutrition" | "meals" | "groceries" | "tasks";
export type CalendarView = "day" | "week" | "month" | "year" | "agenda";

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
  | "ai"
  | "life"
  | "data";

export type CommsSurface = "inbox" | "health" | "subscriptions" | "rules" | "summary";
export type CommsRequest = { surface: CommsSurface; view?: string; sender?: string; query?: string; accountId?: string; seq: number };

export const SCREEN_ORDER: readonly Screen[] = ["home", "calendar", "life", "gaming", "media", "communications", "system"];

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
  lifeSection: LifeSection;
  /** Open a specific life entity (routine id, template id, meal id…) once. */
  lifeFocus: { section: LifeSection; id?: string; action?: string; seq: number } | null;
  calendarView: CalendarView;
  calendarDay: string | null;
  commandPaletteOpen: boolean;
  setBootPhase: (phase: BootPhase) => void;
  navigate: (screen: Screen) => void;
  setSystemTab: (tab: SystemTab) => void;
  setSettingsSection: (section: SettingsSection) => void;
  openCommunications: (req: Omit<CommsRequest, "seq">) => void;
  openLife: (section: LifeSection, focus?: { id?: string; action?: string }) => void;
  openCalendar: (view?: CalendarView, day?: string) => void;
  setLifeSection: (s: LifeSection) => void;
  setCalendarView: (v: CalendarView) => void;
  setCalendarDay: (d: string | null) => void;
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
  lifeSection: "overview",
  lifeFocus: null,
  calendarView: "day",
  calendarDay: null,
  commandPaletteOpen: false,
  setBootPhase: (bootPhase) => set({ bootPhase }),
  navigate: (screen) => set({ screen, selectedGameId: null }),
  setSystemTab: (systemTab) => set({ systemTab }),
  setSettingsSection: (settingsSection) => set({ settingsSection }),
  openLife: (section, focus) => set((st) => ({ screen: "life", selectedGameId: null, lifeSection: section, lifeFocus: focus ? { section, ...focus, seq: (st.lifeFocus?.seq ?? 0) + 1 } : st.lifeFocus })),
  openCalendar: (view, day) => set((st) => ({ screen: "calendar", selectedGameId: null, calendarView: view ?? st.calendarView, calendarDay: day ?? st.calendarDay })),
  setLifeSection: (lifeSection) => set({ lifeSection }),
  setCalendarView: (calendarView) => set({ calendarView }),
  setCalendarDay: (calendarDay) => set({ calendarDay }),
  openCommunications: (req) => set((st) => ({ screen: "communications", selectedGameId: null, commsRequest: { ...req, seq: (st.commsRequest?.seq ?? 0) + 1 } })),
  selectGame: (selectedGameId) => set({ selectedGameId }),
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  toggleCommandPalette: () =>
    set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
}));
