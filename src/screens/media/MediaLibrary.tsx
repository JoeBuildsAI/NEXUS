import { useMemo, useState } from "react";
import { ChevronRight, Folder, FolderPlus, Play, Plus, Search, Star, X } from "lucide-react";
import { Button, ContextMenu, type ContextMenuItem } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { useThumbnails } from "@/hooks/useThumbnails";
import { getProviders } from "@/providers";
import { useMediaStore } from "@/state/mediaStore";
import { notify } from "@/state/toastStore";
import type { MediaCollection, MediaItem } from "@/core/types";
import { formatBytes, formatDuration, formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

type View = "library" | "favorites" | "recent" | "collections";

/** Local browsing. Folder names and counts only — paths stay out of the interface. */
export function MediaLibrary({ view, items, onChanged }: { view: View; items: readonly MediaItem[]; onChanged: () => void }) {
  const provider = useMemo(() => getProviders().media, []);
  const { data: collections, reload: reloadCollections } = useAsync<readonly MediaCollection[]>(() => provider.getCollections(), [items.length, view]);
  const [collection, setCollection] = useState<string | null>(null);
  const [folder, setFolder] = useState<string>("");
  const [query, setQuery] = useState("");
  const [newCollection, setNewCollection] = useState("");
  const slots = useMediaStore((s) => s.slots);
  const setSlotItem = useMediaStore((s) => s.setSlotItem);

  const folders = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) {
      const f = i.folder ?? "";
      if (!f) continue;
      const parts = f.split("\\");
      for (let k = 1; k <= parts.length; k++) set.add(parts.slice(0, k).join("\\"));
    }
    return [...set].sort();
  }, [items]);
  const childFolders = useMemo(() => folders.filter((f) => (folder ? f.startsWith(folder + "\\") && f.slice(folder.length + 1).indexOf("\\") === -1 : f.indexOf("\\") === -1)), [folders, folder]);

  const filtered = useMemo(() => {
    let all = [...items];
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      return all.filter((i) => i.title.toLowerCase().includes(q) || (i.folder ?? "").toLowerCase().includes(q));
    }
    if (view === "favorites") all = all.filter((i) => i.favorite);
    else if (view === "recent") all = all.sort((a, b) => b.addedAt - a.addedAt).slice(0, 24);
    else if (view === "collections" && collection) all = collection === "favorites" ? all.filter((i) => i.favorite) : all.filter((i) => i.collectionId === collection);
    else if (view === "library") all = all.filter((i) => (i.folder ?? "") === folder);
    return all;
  }, [items, view, collection, folder, query]);

  useThumbnails(filtered.slice(0, 60));

  const sendToSlot = (item: MediaItem, index?: number) => {
    if (item.available === false) return notify.warn("Unavailable", "The source drive or file is not reachable right now.");
    const target = index ?? (slots.find((s) => !s.itemId) ?? slots[0]!).index;
    setSlotItem(target, item.id);
    notify.success(`Player ${target + 1}`, item.title);
  };
  const toggleFav = async (item: MediaItem) => { await provider.setFavorite?.(item.id, !item.favorite); onChanged(); reloadCollections(); };
  const addToCollection = async (item: MediaItem, collectionId: string | null) => { await provider.setItemCollection?.(item.id, collectionId); onChanged(); reloadCollections(); };
  const createCollection = async () => {
    const name = newCollection.trim();
    if (!name) return;
    await provider.createCollection?.(name);
    setNewCollection("");
    reloadCollections();
    notify.success("Collection created", name);
  };
  const authorize = async () => {
    const r = await provider.authorizeRoot();
    if (r) { notify.success("Folder authorized", "Indexing"); await provider.scanRoot?.(r.id).catch(() => undefined); onChanged(); }
  };

  const menuFor = (item: MediaItem): (ContextMenuItem | "separator")[] => [
    { id: "load", label: "Load into next player", icon: <Play size={13} />, onSelect: () => sendToSlot(item) },
    ...slots.slice(0, 6).map((s) => ({ id: `slot-${s.index}`, label: `Load into player ${s.index + 1}`, onSelect: () => sendToSlot(item, s.index) })),
    "separator" as const,
    { id: "fav", label: item.favorite ? "Remove from favorites" : "Add to favorites", icon: <Star size={13} />, onSelect: () => void toggleFav(item) },
    ...((collections ?? []).filter((c) => c.id !== "favorites").map((c) => ({ id: `col-${c.id}`, label: item.collectionId === c.id ? `Remove from ${c.name}` : `Add to ${c.name}`, onSelect: () => void addToCollection(item, item.collectionId === c.id ? null : c.id) })) as ContextMenuItem[]),
  ];

  if (view === "collections" && !collection) {
    return (
      <div>
        <div className="mb-8 flex items-center gap-3">
          <input value={newCollection} onChange={(e) => setNewCollection(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void createCollection()} placeholder="New collection" className="h-9 w-64 border-b border-white/15 bg-transparent text-sm text-white/85 placeholder:text-white/25 focus:border-white/50 focus:outline-none" />
          <Button size="sm" variant="ghost" onClick={() => void createCollection()}><Plus size={14} /> Create</Button>
        </div>
        <div className="grid grid-cols-2 gap-x-10 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
          {(collections ?? []).map((c) => {
            const members = c.id === "favorites" ? items.filter((i) => i.favorite) : items.filter((i) => i.collectionId === c.id);
            return (
              <div key={c.id} className="group relative">
                <button onClick={() => setCollection(c.id)} className="block w-full text-left">
                  <div className="grid aspect-[16/7] grid-cols-3 gap-1 overflow-hidden rounded-sm bg-white/[0.02]">
                    {members.slice(0, 3).map((i) => <div key={i.id} style={{ background: i.thumbnailColor }} />)}
                  </div>
                  <p className="mt-3 flex items-center gap-2 text-[15px] text-white/85 transition-colors group-hover:text-white">{c.id === "favorites" && <Star size={12} className="fill-white/70 text-white/70" />}{c.name}</p>
                  <p className="text-[12px] text-white/35">{members.length} video{members.length === 1 ? "" : "s"}</p>
                </button>
                {c.id !== "favorites" && (
                  <button onClick={() => void provider.deleteCollection?.(c.id).then(() => { reloadCollections(); onChanged(); })} className="absolute right-0 top-0 p-2 text-white/25 opacity-0 transition-opacity hover:text-status-critical group-hover:opacity-100" title="Delete collection"><X size={13} /></button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <nav className="flex min-w-0 items-center gap-2 text-[13px]">
          {view === "collections" && collection && <button onClick={() => setCollection(null)} className="text-white/45 hover:text-white">Collections</button>}
          {view === "library" && (
            <>
              <button onClick={() => setFolder("")} className={cn("transition-colors", folder ? "text-white/45 hover:text-white" : "text-white")}>Library</button>
              {folder.split("\\").filter(Boolean).map((part, i, arr) => (
                <span key={i} className="flex items-center gap-2">
                  <ChevronRight size={12} className="text-white/20" />
                  <button onClick={() => setFolder(arr.slice(0, i + 1).join("\\"))} className={i === arr.length - 1 ? "text-white" : "text-white/45 hover:text-white"}>{part}</button>
                </span>
              ))}
            </>
          )}
          {view !== "library" && !(view === "collections" && collection) && <span className="text-white capitalize">{view}</span>}
          <span className="ml-3 font-mono text-[11px] tabular text-white/30">{filtered.length}</span>
        </nav>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Search size={13} className="text-white/30" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search library (local)" className="h-8 w-40 border-b border-white/10 bg-transparent text-sm text-white/85 placeholder:text-white/25 focus:border-white/50 focus:outline-none" />
          </div>
          <Button size="sm" variant="ghost" onClick={() => void authorize()}><FolderPlus size={14} /> Add folder</Button>
        </div>
      </div>

      {view === "library" && !query && childFolders.length > 0 && (
        <div className="mb-10 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
          {childFolders.map((f) => {
            const inside = items.filter((i) => (i.folder ?? "").startsWith(f));
            const latest = Math.max(0, ...inside.map((i) => i.addedAt));
            return (
              <button key={f} onClick={() => setFolder(f)} className="group flex items-start gap-3 text-left">
                <Folder size={16} strokeWidth={1.5} className="mt-0.5 text-white/30 transition-colors group-hover:text-white/70" />
                <span className="min-w-0">
                  <span className="block truncate text-[14px] text-white/80 transition-colors group-hover:text-white">{f.split("\\").pop()}</span>
                  <span className="block text-[11.5px] text-white/35">{inside.length} video{inside.length === 1 ? "" : "s"}{latest ? ` · ${formatRelativeTime(latest)}` : ""}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="py-20 text-center">
          <p className="font-display text-display-sm uppercase tracking-wide2 text-white/60">{view === "favorites" ? "No favorites" : query ? "No matches" : "Empty"}</p>
          <p className="mt-2 text-sm text-white/35">{view === "favorites" ? "Star videos in the library to collect them here." : query ? "Search is local to this machine." : "Add a folder to build your library."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {filtered.map((item) => (
            <ContextMenu key={item.id} items={menuFor(item)}>
              <div className={cn("group", item.available === false && "opacity-50")}>
                <div className="relative aspect-video overflow-hidden rounded-sm bg-black">
                  <div className="absolute inset-0 transition-transform duration-700 ease-nexus group-hover:scale-[1.03]" style={{ background: `radial-gradient(90% 90% at 30% 20%, ${item.thumbnailColor}, #000 90%)` }}>
                    {item.thumbnailUrl && <img src={item.thumbnailUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
                  </div>
                  <button onClick={() => sendToSlot(item)} className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100" aria-label={`Load ${item.title}`}>
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-black"><Play size={14} className="ml-0.5" fill="currentColor" /></span>
                  </button>
                  <button onClick={() => void toggleFav(item)} className={cn("absolute right-2 top-2 p-1 transition-opacity", item.favorite ? "opacity-100" : "opacity-0 group-hover:opacity-100")} aria-label={item.favorite ? "Unfavorite" : "Favorite"}>
                    <Star size={13} className={item.favorite ? "fill-white text-white" : "text-white/70"} />
                  </button>
                  {item.playability === "potentially-unsupported" && <span className="absolute left-2 top-2 text-micro text-status-attention/80">{item.ext?.toUpperCase()}</span>}
                  {item.available === false && <span className="absolute left-2 top-2 text-micro text-status-attention/80">Unavailable</span>}
                </div>
                <div className="mt-2.5 flex items-baseline justify-between gap-3">
                  <p className="truncate text-[13.5px] text-white/85">{item.title}</p>
                  <span className="shrink-0 font-mono text-[10.5px] tabular text-white/35">{item.durationSeconds ? formatDuration(item.durationSeconds) : item.sizeBytes ? formatBytes(item.sizeBytes, 0) : ""}</span>
                </div>
              </div>
            </ContextMenu>
          ))}
        </div>
      )}
    </div>
  );
}
