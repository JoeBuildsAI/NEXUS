import { useMemo, useState } from "react";
import { FolderPlus, Play, Star } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { getProviders } from "@/providers";
import { useMediaStore } from "@/state/mediaStore";
import { useNavigationStore } from "@/state/navigationStore";
import { notify } from "@/state/toastStore";
import type { MediaCollection, MediaItem } from "@/core/types";
import { formatDuration, formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

type View = "library" | "favorites" | "recent" | "collections";

export function MediaLibrary({ view, items }: { view: View; items: readonly MediaItem[] }) {
  const provider = useMemo(() => getProviders().media, []);
  const { data: collections } = useAsync<readonly MediaCollection[]>(() => provider.getCollections(), []);
  const [collection, setCollection] = useState<string | null>(null);
  const slots = useMediaStore((s) => s.slots);
  const setSlotItem = useMediaStore((s) => s.setSlotItem);
  const navigate = useNavigationStore((s) => s.navigate);

  const filtered = useMemo(() => {
    let all = [...items];
    if (view === "favorites") all = all.filter((i) => i.favorite);
    if (view === "recent") all = all.sort((a, b) => b.addedAt - a.addedAt).slice(0, 8);
    if (view === "collections" && collection) all = all.filter((i) => i.collectionId === collection);
    return all;
  }, [items, view, collection]);

  const sendToSlot = (item: MediaItem) => {
    const empty = slots.find((s) => !s.itemId) ?? slots[0]!;
    setSlotItem(empty.index, item.id);
    notify.success(`Loaded into Player ${empty.index + 1}`, item.title);
  };

  if (view === "collections" && !collection) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {(collections ?? []).map((c) => (
          <button key={c.id} onClick={() => setCollection(c.id)} className="group rounded-2xl border border-white/[0.06] p-5 text-left transition-colors hover:border-white/15 hover:bg-white/[0.02]">
            <div className="grid grid-cols-3 gap-1">
              {items.filter((i) => i.collectionId === c.id).slice(0, 3).map((i) => <div key={i.id} className="aspect-video rounded-sm" style={{ background: i.thumbnailColor }} />)}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <h3 className="text-white/85">{c.name}</h3>
              <Badge tone="neutral">{c.itemCount}</Badge>
            </div>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm text-white/40">
          {view === "collections" && collection && (
            <button onClick={() => setCollection(null)} className="mr-2 text-accent hover:underline">← Collections</button>
          )}
          {filtered.length} items · stored locally · private
        </p>
        <Button size="sm" variant="outline" onClick={async () => { const r = await provider.authorizeRoot(); if (r) notify.success("Folder authorized", r.path); }}>
          <FolderPlus size={14} /> Authorize folder
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/[0.08] p-12 text-center">
          <p className="font-display text-xl tracking-cinematic text-white/60">NOTHING HERE</p>
          <p className="mt-2 text-sm text-white/35">{view === "favorites" ? "Star items in the library to see them here." : "Authorize a folder to build your library."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {filtered.map((item) => (
            <div key={item.id} className="group relative aspect-video overflow-hidden rounded-xl ring-1 ring-white/[0.06] transition-shadow hover:ring-white/20" style={{ background: item.thumbnailColor }}>
              <div className="absolute inset-0 bg-grid opacity-10" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
              {item.favorite && <Star size={14} className="absolute right-2.5 top-2.5 fill-ember text-ember" />}
              <button onClick={() => { sendToSlot(item); }} className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100" title="Send to workspace">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur"><Play size={20} className="ml-0.5" /></span>
              </button>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3">
                <p className="truncate text-sm font-medium text-white/95">{item.title}</p>
                <div className="mt-0.5 flex items-center justify-between text-[11px] text-white/45">
                  <span>{formatRelativeTime(item.addedAt)}</span>
                  <span className="font-mono">{formatDuration(item.durationSeconds)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className={cn("mt-6 text-xs text-white/30")}>Tip: click a video to load it into the next empty player, then open <button onClick={() => navigate("media")} className="text-accent">Workspace</button>.</p>
    </div>
  );
}
