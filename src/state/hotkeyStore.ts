import { create } from "zustand";

interface HotkeyState {
  /** null = not attempted (browser preview), true/false = OS registration result. */
  registered: boolean | null;
  error: string | null;
  accelerator: string | null;
  set: (patch: Partial<Omit<HotkeyState, "set">>) => void;
}

/** Truthful status of the OS-level privacy shortcut, surfaced in Settings → Privacy. */
export const useHotkeyStore = create<HotkeyState>((set) => ({
  registered: null,
  error: null,
  accelerator: null,
  set: (patch) => set(patch),
}));
