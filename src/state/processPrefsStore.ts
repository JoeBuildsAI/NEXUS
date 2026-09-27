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

/**
 * Before v3 the store shipped with Spotify + Discord pre-approved for closing.
 * An untouched copy of exactly that default was never a user decision, so it is
 * dropped; any other allowlist is the user's own and is kept.
 */
export function migratePrefs(raw: Record<string, string>, version: number): { prefs: Record<string, ProcessPreference> } {
  const prefs: Record<string, ProcessPreference> = {};
  for (const [k, v] of Object.entries(raw)) prefs[k] = normalizePref(v);
  const keys = Object.keys(prefs).sort();
  if (version < 3 && keys.length === 2 && keys[0] === "discord.exe" && keys[1] === "spotify.exe" && prefs["discord.exe"] === "close" && prefs["spotify.exe"] === "close") return { prefs: {} };
  return { prefs };
}

export const useProcessPrefsStore = create<ProcessPrefsState>()(
  persist(
    (set, get) => ({
      // Nothing is pre-approved: every close requires an explicit user choice.
      prefs: {},
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
      version: 3,
      migrate: (persisted, version) => migratePrefs((persisted as { prefs?: Record<string, string> })?.prefs ?? {}, version) as unknown as ProcessPrefsState,
    },
  ),
);
