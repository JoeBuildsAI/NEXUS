import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { FolderListing } from "@/core/native";
import { native } from "@/core/native";
import { nextRepeat, type RepeatMode } from "@/core/playlist";

export interface Markers {
  a: number | null;
  b: number | null;
}

/** Remembered markers are bounded so long use never grows storage without limit. */
const MAX_REMEMBERED_MARKERS = 500;

interface PlayerState {
  listing: FolderListing | null;
  current: string | null;
  error: string | null;
  loading: boolean;
  thumbs: Record<string, string | null>;

  // Persisted preferences
  repeat: RepeatMode;
  loopAB: boolean;
  volume: number;
  muted: boolean;
  rate: number;
  panelOpen: boolean;
  lastFile: string | null;
  markers: Record<string, Markers>;

  openFile: (path: string) => Promise<boolean>;
  openFolder: (path: string) => Promise<boolean>;
  refresh: () => Promise<void>;
  select: (path: string) => void;
  setThumb: (path: string, url: string | null) => void;
  setMarker: (which: "a" | "b", t: number | null) => void;
  clearMarkers: () => void;
  setLoopAB: (on: boolean) => void;
  cycleRepeat: () => void;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
  setRate: (r: number) => void;
  togglePanel: () => void;
  dismissError: () => void;
}

const message = (e: unknown) => String((e as Error)?.message ?? e).slice(0, 200);

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => ({
      listing: null,
      current: null,
      error: null,
      loading: false,
      thumbs: {},
      repeat: "off",
      loopAB: false,
      volume: 1,
      muted: false,
      rate: 1,
      panelOpen: true,
      lastFile: null,
      markers: {},

      openFile: async (path) => {
        set({ loading: true, error: null });
        try {
          const listing = await native.openVideo(path);
          set({ listing, current: listing.current, lastFile: listing.current, loading: false });
          return true;
        } catch (e) {
          set({ loading: false, error: message(e) });
          return false;
        }
      },

      openFolder: async (path) => {
        set({ loading: true, error: null });
        try {
          const listing = await native.openFolder(path);
          const first = listing.videos.find((v) => v.playable)?.path ?? null;
          set({ listing, current: first, lastFile: first ?? get().lastFile, loading: false });
          return true;
        } catch (e) {
          set({ loading: false, error: message(e) });
          return false;
        }
      },

      refresh: async () => {
        const l = get().listing;
        if (!l) return;
        try {
          const listing = await native.refreshFolder(l.folder);
          set({ listing: { ...listing, current: get().current } });
        } catch (e) {
          set({ error: message(e) });
        }
      },

      select: (path) => set({ current: path, lastFile: path }),
      setThumb: (path, url) => set((s) => ({ thumbs: { ...s.thumbs, [path]: url } })),

      setMarker: (which, t) => {
        const cur = get().current;
        if (!cur) return;
        set((s) => {
          const prev = s.markers[cur] ?? { a: null, b: null };
          const next = { ...prev, [which]: t };
          const entries = Object.entries({ ...s.markers, [cur]: next });
          // Keep the newest entries (insertion order) within the bound.
          const markers = Object.fromEntries(entries.slice(-MAX_REMEMBERED_MARKERS));
          return { markers };
        });
      },
      clearMarkers: () => {
        const cur = get().current;
        if (!cur) return;
        set((s) => {
          const { [cur]: _drop, ...rest } = s.markers;
          return { markers: rest, loopAB: false };
        });
      },
      setLoopAB: (loopAB) => set({ loopAB }),
      cycleRepeat: () => set((s) => ({ repeat: nextRepeat(s.repeat) })),
      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)), muted: volume <= 0 ? true : false }),
      setMuted: (muted) => set({ muted }),
      setRate: (rate) => set({ rate: Math.min(4, Math.max(0.25, Math.round(rate * 100) / 100)) }),
      togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
      dismissError: () => set({ error: null }),
    }),
    {
      name: "nexus-player",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ repeat: s.repeat, volume: s.volume, muted: s.muted, rate: s.rate, panelOpen: s.panelOpen, lastFile: s.lastFile, markers: s.markers }),
    },
  ),
);

const NO_MARKERS: Markers = Object.freeze({ a: null, b: null });
/** Stable selector result (safe to use directly in a zustand selector). */
export const markersOf = (s: Pick<PlayerState, "markers" | "current">): Markers => (s.current ? s.markers[s.current] : undefined) ?? NO_MARKERS;
