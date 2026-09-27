import { createJSONStorage, type StateStorage } from "zustand/middleware";

/**
 * Persistence hardening shared by every store.
 *  - `safeStorage` never throws on corrupt JSON: the bad value is moved aside
 *    to `<key>.corrupt` and hydration falls back to defaults.
 *  - The `v*` helpers coerce persisted values to a known shape so a corrupted
 *    or older config can never put the UI into an impossible state.
 */
const raw: StateStorage = {
  getItem: (name) => {
    try {
      const v = localStorage.getItem(name);
      if (v == null) return null;
      JSON.parse(v); // validate before handing to zustand
      return v;
    } catch {
      try {
        const bad = localStorage.getItem(name);
        if (bad != null) localStorage.setItem(`${name}.corrupt`, bad);
        localStorage.removeItem(name);
      } catch {
        /* storage unavailable */
      }
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      /* quota / unavailable: state stays in memory */
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

export const safeStorage = () => createJSONStorage(() => raw);

export const vStr = (v: unknown, fallback: string, max = 200): string => (typeof v === "string" ? v.slice(0, max) : fallback);
export const vBool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);
export const vNum = (v: unknown, fallback: number, min = -Infinity, max = Infinity): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
export const vOneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => (typeof v === "string" && (options as readonly string[]).includes(v) ? (v as T) : fallback);
export const vArr = <T>(v: unknown, guard: (x: unknown) => x is T, fallback: readonly T[] = [], max = 10_000): T[] => (Array.isArray(v) ? v.filter(guard).slice(0, max) : [...fallback]);
export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const isStr = (v: unknown): v is string => typeof v === "string";
