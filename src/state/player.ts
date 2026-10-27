import { create } from "zustand";
import type { FolderListing } from "@/core/native";
import { native } from "@/core/native";
import { nextRepeat, type RepeatMode } from "@/core/playlist";
import { loadDefaults, loadMarkers, migrateLegacy, NO_MARKERS, saveDefaults, saveLastFile, saveMarkers, type Markers } from "@/core/persistence";

export type { Markers };

/**
 * Playback state of THIS window. Each NEXUS window is a separate document, so
 * this store is never shared; persistence goes through core/persistence
 * (window defaults, per-video A–B presets) and never syncs live between windows.
 */
interface PlayerState {
  listing: FolderListing | null;
  current: string | null;
  error: string | null;
  loading: boolean;
  thumbs: Record<string, string | null>;
  markers: Markers;

  repeat: RepeatMode;
  loopAB: boolean;
  volume: number;
  muted: boolean;
  rate: number;
  panelOpen: boolean;

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

const storage = (): Storage | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

const initial = (() => {
  const s = storage();
  if (!s) return loadDefaults({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined, key: () => null, length: 0 });
  migrateLegacy(s);
  return loadDefaults(s);
})();

export const usePlayer = create<PlayerState>()((set, get) => {
  /** Remember this window's preference as the default for future windows. */
  const remember = () => {
    const s = storage();
    const { volume, muted, rate, repeat, panelOpen } = get();
    if (s) saveDefaults(s, { volume, muted, rate, repeat, panelOpen });
  };
  /** Switch this window to a video: load its shared A–B preset. */
  const show = (path: string | null) => {
    const s = storage();
    if (path && s) saveLastFile(s, path);
    set({ current: path, markers: path && s ? loadMarkers(s, path) : NO_MARKERS, loopAB: false });
  };

  return {
    listing: null,
    current: null,
    error: null,
    loading: false,
    thumbs: {},
    markers: NO_MARKERS,
    loopAB: false,
    ...initial,

    openFile: async (path) => {
      set({ loading: true, error: null });
      try {
        const listing = await native.openVideo(path);
        set({ listing, loading: false });
        show(listing.current);
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
        set({ listing, loading: false });
        show(listing.videos.find((v) => v.playable)?.path ?? null);
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

    select: (path) => show(path),
    setThumb: (path, url) => set((s) => ({ thumbs: { ...s.thumbs, [path]: url } })),

    setMarker: (which, t) => {
      const cur = get().current;
      if (!cur) return;
      const markers = { ...get().markers, [which]: t };
      set({ markers });
      const s = storage();
      if (s) saveMarkers(s, cur, markers);
    },
    clearMarkers: () => {
      const cur = get().current;
      if (!cur) return;
      set({ markers: NO_MARKERS, loopAB: false });
      const s = storage();
      if (s) saveMarkers(s, cur, NO_MARKERS);
    },
    setLoopAB: (loopAB) => set({ loopAB }),
    cycleRepeat: () => { set((s) => ({ repeat: nextRepeat(s.repeat) })); remember(); },
    setVolume: (volume) => { set({ volume: Math.min(1, Math.max(0, volume)), muted: volume <= 0 }); remember(); },
    setMuted: (muted) => { set({ muted }); remember(); },
    setRate: (rate) => { set({ rate: Math.min(4, Math.max(0.25, Math.round(rate * 100) / 100)) }); remember(); },
    togglePanel: () => { set((s) => ({ panelOpen: !s.panelOpen })); remember(); },
    dismissError: () => set({ error: null }),
  };
});

/** Stable selector result (safe to use directly in a zustand selector). */
export const markersOf = (s: Pick<PlayerState, "markers">): Markers => s.markers;
