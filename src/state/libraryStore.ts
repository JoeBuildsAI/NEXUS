import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Game, GameDetails } from "@/core/types";
import { getProviders } from "@/providers";
import { isOffline } from "@/core/errors";
import { createLogger } from "@/lib/logger";

const log = createLogger("library");

interface CachedDetails {
  at: number;
  value: GameDetails;
}

interface LibraryState {
  games: Game[];
  loadedAt: number | null;
  loading: boolean;
  /** Typed offline state (Steam not detected / provider offline). */
  offline: boolean;
  mode: "real" | "demo";
  /** Achievement/detail cache keyed by game id. Persisted for offline rendering. */
  details: Record<string, CachedDetails>;
  /** Ids currently being fetched (dedupes concurrent requests). */
  inflight: string[];
  load: (opts?: { force?: boolean }) => Promise<void>;
  /**
   * Ensure details exist for the given ids, fetching missing/stale ones with a
   * small concurrency limit. Resolves when all requested ids are settled.
   */
  ensureDetails: (ids: readonly string[], opts?: { maxAge?: number; concurrency?: number }) => Promise<void>;
  refreshDetails: (id: string) => Promise<GameDetails | null>;
  detailsOf: (id: string) => GameDetails | null;
  /** Games merged with cached details where available. */
  withDetails: () => GameDetails[];
  clearCache: () => void;
  /** Internal: store details with LRU trimming. */
  setDetails: (id: string, value: GameDetails) => void;
}

const LIST_TTL = 60_000;
const DETAILS_TTL = 30 * 60_000;
const MAX_CACHED_DETAILS = 400;

/** Fresh details view for a game without achievement data. */
function bare(game: Game): GameDetails {
  return { ...game, achievements: { gameId: game.id, unlocked: 0, total: 0, achievements: [], status: "not-configured" }, summary: "", developer: "", publisher: "" };
}

/**
 * Library data layer. One list fetch, progressive detail fetches prioritized
 * by the caller (featured → recent → visible → selected), never all-at-once.
 */
export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      games: [],
      loadedAt: null,
      loading: false,
      offline: false,
      mode: "demo",
      details: {},
      inflight: [],

      load: async ({ force } = {}) => {
        const { loading, loadedAt } = get();
        if (loading) return;
        if (!force && loadedAt && Date.now() - loadedAt < LIST_TTL) return;
        set({ loading: true });
        const { steam } = getProviders();
        try {
          const games = [...(await steam.getGames())];
          const withMode = steam as { mode?: () => Promise<"real" | "demo"> };
          const mode = typeof withMode.mode === "function" ? await withMode.mode() : "demo";
          // Keep only cached details for games still present; reconcile core fields.
          const details: Record<string, CachedDetails> = {};
          for (const g of games) {
            const d = get().details[g.id];
            if (d) details[g.id] = { at: d.at, value: { ...d.value, ...g, achievements: d.value.achievements } };
          }
          set({ games, loadedAt: Date.now(), offline: false, mode, details });
          log.info("Library loaded", { games: games.length, mode });
        } catch (err) {
          if (isOffline(err)) set({ offline: true, loadedAt: Date.now() });
          else log.warn("Library load failed", { error: String(err) });
        } finally {
          set({ loading: false });
        }
      },

      ensureDetails: async (ids, { maxAge = DETAILS_TTL, concurrency = 2 } = {}) => {
        const now = Date.now();
        const state = get();
        const wanted = [...new Set(ids)].filter((id) => {
          const d = state.details[id];
          return (!d || now - d.at > maxAge) && !state.inflight.includes(id);
        });
        if (wanted.length === 0) return;
        set((s) => ({ inflight: [...s.inflight, ...wanted] }));
        const { steam } = getProviders();
        const queue = [...wanted];
        const worker = async () => {
          while (queue.length) {
            const id = queue.shift()!;
            try {
              const value = await steam.getGameDetails(id);
              if (value) get().setDetails(id, value);
            } catch (err) {
              log.warn("Details fetch failed", { id, error: String(err) });
            } finally {
              set((s) => ({ inflight: s.inflight.filter((x) => x !== id) }));
            }
          }
        };
        await Promise.all(Array.from({ length: Math.min(concurrency, wanted.length) }, worker));
      },

      refreshDetails: async (id) => {
        const { steam } = getProviders();
        steam.invalidate?.();
        try {
          const value = await steam.getGameDetails(id);
          if (value) get().setDetails(id, value);
          return value;
        } catch {
          return null;
        }
      },

      detailsOf: (id) => get().details[id]?.value ?? null,

      withDetails: () => get().games.map((g) => get().details[g.id]?.value ?? bare(g)),

      clearCache: () => set({ details: {}, loadedAt: null }),

      setDetails: (id, value) =>
        set((s) => {
          const details = { ...s.details, [id]: { at: Date.now(), value } };
          const keys = Object.keys(details);
          if (keys.length > MAX_CACHED_DETAILS) {
            keys.sort((a, b) => details[a]!.at - details[b]!.at).slice(0, keys.length - MAX_CACHED_DETAILS).forEach((k) => delete details[k]);
          }
          return { details };
        }),
    }),
    {
      name: "nexus-library-cache",
      version: 1,
      partialize: (s) => ({ games: s.games, details: s.details, mode: s.mode }),
      merge: (persisted, current) => ({ ...current, ...((persisted ?? {}) as Partial<LibraryState>), loading: false, inflight: [], loadedAt: null }),
    },
  ),
);

