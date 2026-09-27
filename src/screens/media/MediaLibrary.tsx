import { useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, Folder, FolderOpen, FolderPlus, Play, Plus, Search, Star, X } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { getProviders } from "@/providers";
import { useMediaStore } from "@/state/mediaStore";
import { useNavigationStore } from "@/state/navigationStore";
import { notify } from "@/state/toastStore";
import type { MediaCollection, MediaItem } from "@/core/types";
import { formatBytes, formatDuration, formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

type View = "library" | "favorites" | "recent" | "collections";

export function MediaLibrary({ view, items, onChanged }: { view: View; items: readonly MediaItem[]; onChanged: () => void }) {
  const provider = useMemo(() => getProviders().media, []);
  const { data: collections, reload: reloadCollections } = useAsync<readonly MediaCollection[]>(() => provider.getCollections(), [items.length, view]);
  const [collection, setCollection] = useState<string | null>(null);
  const [folder, setFolder] = useState<string>("");
  const [query, setQuery] = useState("");
  const [newCollection, setNewCollection] = useState("");
  const slots = useMediaStore((s) => s.slots);
  const setSlotItem = useMediaStore((s) => s.setSlotItem);
  const navigate = useNavigationStore((s) => s.navigate);

  // Folder tree (real media only; demo items have no folder).
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
    if (view === "favorites") all = all.filter((i) => i.favorite);
    else if (view === "recent") all = all.sort((a, b) => b.addedAt - a.addedAt).slice(0, 24);
    else if (view === "collections" && collection) all = collection === "favorites" ? all.filter((i) => i.favorite) : all.filter((i) => i.collectionId === collection);
    else if (view === "library") all = all.filter((i) => (i.folder ?? "") === folder);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      all = [...items].filter((i) => i.title.toLowerCase().includes(q) || (i.folder ?? "").toLowerCase().includes(q));
    }
    return all;
  }, [items, view, collection, folder, query]);

  const sendToSlot = (item: MediaItem) => {
    if (item.available === false) {
      notify.warn("File unavailable", "The source drive or file is not reachable right now.");
      return;
    }
    const empty = slots.find((s) => !s.itemId) ?? slots[0]!;
    setSlotItem(empty.index, item.id);
    notify.success(`Loaded into Player ${empty.index + 1}`, item.title);
  };

  const toggleFav = async (item: MediaItem) => {
    await provider.setFavorite?.(item.id, !item.favorite);
    onChanged();
    reloadCollections();
  };

  const addToCollection = async (item: MediaItem, collectionId: string | null) => {
    await provider.setItemCollection?.(item.id, collectionId);
    onChanged();
    reloadCollections();
  };

  const createCollection = async () => {
    const name = newCollection.trim();
    if (!name) return;
    await provider.createCollection?.(name);
    setNewCollection("");
    reloadCollections();
    notify.success("Collection created", name);
  };

  if (view === "collections" && !collection) {
    return (
      <div>
        <div className="mb-5 flex items-center gap-2">
          <input value={newCollection} onChange={(e) => setNewCollection(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void createCollection()} placeholder="New collection name" className="h-9 w-64 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 text-sm text-white/85 placeholder:text-white/25 focus:border-accent/40 focus:outline-none" />
          <Button size="sm" variant="outline" onClick={() => void createCollection()}><Plus size={14} /> Create</Button>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {(collections ?? []).map((c) => {
            const members = c.id === "favorites" ? items.filter((i) => i.favorite) : items.filter((i) => i.collectionId === c.id);
            return (
              <div key={c.id} className="group relative rounded-2xl border border-white/[0.06] p-5 transition-colors hover:border-white/15 hover:bg-white/[0.02]">
                <button onClick={() => setCollection(c.id)} className="block w-full text-left">
                  <div className="grid grid-cols-3 gap-1">
                    {members.slice(0, 3).map((i) => <div key={i.id} className="aspect-video rounded-sm" style={{ background: i.thumbnailColor }} />)}
                    {members.length === 0 && <div className="col-span-3 aspect-[3/1] rounded-sm border border-dashed border-white/[0.08]" />}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-white/85">{c.id === "favorites" && <Star size={13} className="fill-ember text-ember" />}{c.name}</h3>
                    <Badge tone="neutral">{members.length}</Badge>
                  </div>
                </button>
                {c.id !== "favorites" && (
                  <button onClick={() => void provider.deleteCollection?.(c.id).then(() => { reloadCollections(); onChanged(); })} className="absolute right-3 top-3 text-white/25 opacity-0 transition-opacity hover:text-status-critical group-hover:opacity-100" title="Delete collection"><X size={14} /></button>
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
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm text-white/40">
          {view === "collections" && collection && <button onClick={() => setCollection(null)} className="text-accent hover:underline">← Collections</button>}
          {view === "library" && (
            <nav className="flex items-center gap-1 truncate">
              <button onClick={() => setFolder("")} className={cn("flex items-center gap-1", folder ? "text-accent hover:underline" : "text-white/70")}><FolderOpen size={14} /> Library</button>
              {folder.split("\\").filter(Boolean).map((part, i, arr) => (
                <span key={i} className="flex items-center gap-1">
                  <ChevronRight size={12} className="text-white/25" />
                  <button onClick={() => setFolder(arr.slice(0, i + 1).join("\\"))} className={i === arr.length - 1 ? "text-white/70" : "text-accent hover:underline"}>{part}</button>
                </span>
              ))}
            </nav>
          )}
          <span className="text-white/25">·</span>
          <span>{filtered.length} items · local · private</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3">
            <Search size={13} className="text-white/30" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search (local)" className="h-9 w-44 bg-transparent text-sm text-white/85 placeholder:text-white/30 focus:outline-none" />
          </div>
          <Button size="sm" variant="outline" onClick={async () => { const r = await provider.authorizeRoot(); if (r) { notify.success("Folder authorized"); await provider.scanRoot?.(r.id); onChanged(); } }}>
            <FolderPlus size={14} /> Authorize folder
          </Button>
        </div>
      </div>

      {/* Sub-folders */}
      {view === "library" && !query && childFolders.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {childFolders.map((f) => (
            <button key={f} onClick={() => setFolder(f)} className="flex items-center gap-2 rounded-lg border border-white/[0.07] px-3 py-2 text-sm text-white/70 transition-colors hover:border-accent/30 hover:text-white">
              <Folder size={14} className="text-white/35" /> {f.split("\\").pop()}
              <span className="text-[11px] text-white/30">{items.filter((i) => (i.folder ?? "").startsWith(f)).length}</span>
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/[0.08] p-12 text-center">
          <p className="font-display text-xl tracking-cinematic text-white/60">NOTHING HERE</p>
          <p className="mt-2 text-sm text-white/35">{view === "favorites" ? "Star items in the library to see them here." : query ? "No local matches." : "Authorize a folder to build your library."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {filtered.map((item) => (
            <div key={item.id} className={cn("group relative aspect-video overflow-hidden rounded-xl ring-1 ring-white/[0.06] transition-shadow hover:ring-white/20", item.available === false && "opacity-60")} style={{ background: item.thumbnailColor }}>
              <div className="absolute inset-0 bg-grid opacity-10" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
              <button onClick={() => void toggleFav(item)} className={cn("absolute right-2 top-2 z-10 rounded-md p-1 transition-opacity", item.favorite ? "opacity-100" : "opacity-0 group-hover:opacity-100")} title={item.favorite ? "Unfavorite" : "Favorite"}>
                <Star size={14} className={item.favorite ? "fill-ember text-ember" : "text-white/70"} />
              </button>
              {item.playability === "potentially-unsupported" && (
                <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-status-attention"><AlertTriangle size={10} /> {item.ext?.toUpperCase()} may not play</span>
              )}
              {item.available === false && <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-status-attention">Unavailable</span>}
              <button onClick={() => sendToSlot(item)} className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100" title="Send to workspace">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur"><Play size={20} className="ml-0.5" /></span>
              </button>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3">
                <p className="truncate text-sm font-medium text-white/95">{item.title}</p>
                <div className="mt-0.5 flex items-center justify-between text-[11px] text-white/45">
                  <span>{item.sizeBytes ? formatBytes(item.sizeBytes, 1) : formatRelativeTime(item.addedAt)}</span>
                  <span className="font-mono">{item.durationSeconds ? formatDuration(item.durationSeconds) : item.ext?.toUpperCase() ?? ""}</span>
                </div>
              </div>
              {(collections ?? []).length > 1 && (
                <select
                  value={item.collectionId ?? ""}
                  onChange={(e) => void addToCollection(item, e.target.value || null)}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute bottom-3 right-3 z-10 h-6 max-w-[45%] rounded-md border border-white/10 bg-void-900/90 px-1.5 text-[10px] text-white/70 opacity-0 transition-opacity group-hover:opacity-100 focus:outline-none"
                  title="Collection"
                >
                  <option value="">No collection</option>
                  {(collections ?? []).filter((c) => c.id !== "favorites").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="mt-6 text-xs text-white/30">Click a video to load it into the next empty player, then open <button onClick={() => navigate("media")} className="text-accent">Workspace</button>. Search is local; nothing leaves this machine.</p>
    </div>
  );
}
