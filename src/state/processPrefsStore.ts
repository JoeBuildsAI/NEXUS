import { create } from "zustand";
import { persist } from "zustand/middleware";
import { safeStorage } from "./persistence";

/**
 * User-defined handling for a USER application process.
 *  - "close":  gracefully close when Gaming Mode starts (allowlist)
 *  - "never":  NEXUS must never touch it
 *  - "normal": default; not managed
 * Protected classes (system/driver/security/hardware/unknown) can't be set here.
 * ("suspend" is accepted as a legacy alias of "close".)
 */
export type ProcessPreference = "close" | "never" | "normal";

interface ProcessPrefsState {
  prefs: Record<string, ProcessPreference>;
  setPref: (processName: string, pref: ProcessPreference) => void;
  getPref: (processName: string) => ProcessPreference;
  /** Process names allowed to be closed in Gaming Mode (the effective allowlist). */
  closeAllowlist: () => string[];
  /** @deprecated alias kept for callers/tests */
  suspendAllowlist: () => string[];
}

const key = (n: string) => n.trim().toLowerCase();
const normalizePref = (p: string): ProcessPreference => (p === "suspend" ? "close" : p === "never" ? "never" : p === "close" ? "close" : "normal");

export const useProcessPrefsStore = create<ProcessPrefsState>()(
  persist(
    (set, get) => ({
      prefs: { "spotify.exe": "close", "discord.exe": "close" },
      setPref: (name, pref) =>
        set((s) => {
          const next = { ...s.prefs };
          if (pref === "normal") delete next[key(name)];
          else next[key(name)] = pref;
          return { prefs: next };
        }),
      getPref: (name) => normalizePref(get().prefs[key(name)] ?? "normal"),
      closeAllowlist: () =>
        Object.entries(get().prefs)
          .filter(([, p]) => normalizePref(p) === "close")
          .map(([n]) => n),
      suspendAllowlist: () => get().closeAllowlist(),
    }),
    {
      name: "nexus-process-prefs",
      storage: safeStorage(),
      version: 2,
      migrate: (persisted) => {
        const p = persisted as { prefs?: Record<string, string> };
        const prefs: Record<string, ProcessPreference> = {};
        for (const [k, v] of Object.entries(p?.prefs ?? {})) prefs[k] = normalizePref(v);
        return { prefs } as ProcessPrefsState;
      },
    },
  ),
);
