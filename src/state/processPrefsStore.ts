import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * User-defined handling for a USER application process.
 *  - "suspend": allowed to be suspended in Gaming Mode (allowlist)
 *  - "never":   NEXUS must never touch it
 *  - "normal":  default; not managed
 * Protected classes (system/driver/security/hardware/unknown) can't be set here.
 */
export type ProcessPreference = "suspend" | "never" | "normal";

interface ProcessPrefsState {
  prefs: Record<string, ProcessPreference>;
  setPref: (processName: string, pref: ProcessPreference) => void;
  getPref: (processName: string) => ProcessPreference;
  /** Process names allowed to be suspended (the effective allowlist). */
  suspendAllowlist: () => string[];
}

const key = (n: string) => n.trim().toLowerCase();

export const useProcessPrefsStore = create<ProcessPrefsState>()(
  persist(
    (set, get) => ({
      prefs: { "spotify.exe": "suspend", "discord.exe": "suspend" },
      setPref: (name, pref) =>
        set((s) => {
          const next = { ...s.prefs };
          if (pref === "normal") delete next[key(name)];
          else next[key(name)] = pref;
          return { prefs: next };
        }),
      getPref: (name) => get().prefs[key(name)] ?? "normal",
      suspendAllowlist: () =>
        Object.entries(get().prefs)
          .filter(([, p]) => p === "suspend")
          .map(([n]) => n),
    }),
    { name: "nexus-process-prefs" },
  ),
);
