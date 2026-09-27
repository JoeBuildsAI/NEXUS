import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isObj, isStr, safeStorage, vArr } from "./persistence";
import type { AuthorizedRoot, MediaScanProgress, Playability } from "@/core/types";

/**
 * Local media index. PRIVATE: persisted only in local storage, never exported,
 * never logged, never shown outside the Media screen.
 */
export interface IndexedFile {
  id: string;
  rootId: string;
  path: string;
  name: string;
  folder: string;
  ext: string;
  sizeBytes: number;
  modified: number;
  playability: Playability;
  addedAt: number;
}

export interface LocalCollection {
  id: string;
  name: string;
  itemIds: string[];
}

interface MediaLibraryState {
  roots: AuthorizedRoot[];
  files: IndexedFile[];
  favorites: string[];
  collections: LocalCollection[];
  /** Transient */
  scan: MediaScanProgress | null;
  unavailable: string[];
  /** Transient: file id → thumbnail asset URL (null = none available). */
  thumbs: Record<string, string | null>;
  setThumb: (id: string, url: string | null) => void;
  clearThumbs: () => void;
  addRoot: (root: AuthorizedRoot) => void;
  updateRoot: (id: string, patch: Partial<AuthorizedRoot>) => void;
  removeRoot: (id: string) => void;
  replaceFilesForRoot: (rootId: string, files: IndexedFile[]) => void;
  setFavorite: (id: string, fav: boolean) => void;
  createCollection: (name: string) => LocalCollection;
  setItemCollection: (itemId: string, collectionId: string | null) => void;
  deleteCollection: (id: string) => void;
  setScan: (p: MediaScanProgress | null) => void;
  setUnavailable: (ids: string[]) => void;
  clearHistory: () => void;
}

export const useMediaLibraryStore = create<MediaLibraryState>()(
  persist(
    (set, get) => ({
      roots: [],
      files: [],
      favorites: [],
      collections: [],
      scan: null,
      unavailable: [],
      thumbs: {},
      setThumb: (id, url) => set((s) => ({ thumbs: { ...s.thumbs, [id]: url } })),
      clearThumbs: () => set({ thumbs: {} }),
      addRoot: (root) => set((s) => ({ roots: s.roots.some((r) => r.id === root.id) ? s.roots.map((r) => (r.id === root.id ? { ...r, ...root } : r)) : [...s.roots, root] })),
      updateRoot: (id, patch) => set((s) => ({ roots: s.roots.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
      removeRoot: (id) =>
        set((s) => {
          const gone = new Set(s.files.filter((f) => f.rootId === id).map((f) => f.id));
          return {
            roots: s.roots.filter((r) => r.id !== id),
            files: s.files.filter((f) => f.rootId !== id),
            favorites: s.favorites.filter((f) => !gone.has(f)),
            collections: s.collections.map((c) => ({ ...c, itemIds: c.itemIds.filter((i) => !gone.has(i)) })),
          };
        }),
      replaceFilesForRoot: (rootId, files) =>
        set((s) => {
          const existing = new Map(s.files.filter((f) => f.rootId === rootId).map((f) => [f.id, f.addedAt]));
          const merged = files.map((f) => ({ ...f, addedAt: existing.get(f.id) ?? f.addedAt }));
          return {
            files: [...s.files.filter((f) => f.rootId !== rootId), ...merged],
            roots: s.roots.map((r) => (r.id === rootId ? { ...r, fileCount: files.length, lastScannedAt: Date.now(), exists: true } : r)),
          };
        }),
      setFavorite: (id, fav) => set((s) => ({ favorites: fav ? [...new Set([...s.favorites, id])] : s.favorites.filter((x) => x !== id) })),
      createCollection: (name) => {
        const c: LocalCollection = { id: `col-${Date.now()}`, name: name.trim() || `Collection ${get().collections.length + 1}`, itemIds: [] };
        set((s) => ({ collections: [...s.collections, c] }));
        return c;
      },
      setItemCollection: (itemId, collectionId) =>
        set((s) => ({
          collections: s.collections.map((c) => ({
            ...c,
            itemIds: c.id === collectionId ? [...new Set([...c.itemIds, itemId])] : c.itemIds.filter((i) => i !== itemId),
          })),
        })),
      deleteCollection: (id) => set((s) => ({ collections: s.collections.filter((c) => c.id !== id) })),
      setScan: (scan) => set({ scan }),
      setUnavailable: (unavailable) => set({ unavailable }),
      clearHistory: () => set({ files: [], favorites: [], collections: [], unavailable: [], roots: get().roots.map((r) => ({ ...r, fileCount: 0, lastScannedAt: null })) }),
    }),
    {
      name: "nexus-media-library",
      storage: safeStorage(),
      version: 1,
      partialize: (s) => ({ roots: s.roots, files: s.files, favorites: s.favorites, collections: s.collections }),
      merge: (persisted, current) => {
        const p = isObj(persisted) ? persisted : {};
        return {
          ...current,
          roots: vArr(p.roots, (x): x is AuthorizedRoot => isObj(x) && typeof x.id === "string" && typeof x.path === "string", [], 50),
          files: vArr(p.files, (x): x is IndexedFile => isObj(x) && typeof x.id === "string" && typeof x.path === "string" && typeof x.rootId === "string", [], 50_000),
          favorites: vArr(p.favorites, isStr, [], 5000),
          collections: vArr(p.collections, (x): x is LocalCollection => isObj(x) && typeof x.id === "string" && typeof x.name === "string" && Array.isArray(x.itemIds), [], 200),
          scan: null,
          unavailable: [],
          thumbs: {},
        };
      },
    },
  ),
);
