import { useMemo } from "react";
import { FolderPlus, Play, Star } from "lucide-react";
import { Panel, Button, Badge } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { getProviders } from "@/providers";
import type { MediaCollection, MediaItem } from "@/core/types";
import { formatDuration, formatRelativeTime } from "@/lib/utils";

type View = "library" | "favorites" | "recent" | "collections";

export function MediaLibrary({ view }: { view: View }) {
  const provider = useMemo(() => getProviders().media, []);
  const { data: items } = useAsync<readonly MediaItem[]>(() => provider.getItems(), []);
  const { data: collections } = useAsync<readonly MediaCollection[]>(
    () => provider.getCollections(),
    [],
  );

  const filtered = useMemo(() => {
    const all = [...(items ?? [])];
    if (view === "favorites") return all.filter((i) => i.favorite);
    if (view === "recent")
      return all.sort((a, b) => b.addedAt - a.addedAt).slice(0, 8);
    return all;
  }, [items, view]);

  if (view === "collections") {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {(collections ?? []).map((c) => (
          <Panel key={c.id} className="cursor-pointer p-5 hover:border-white/15">
            <div className="flex items-center justify-between">
              <h3 className="text-white/85">{c.name}</h3>
              <Badge tone="neutral">{c.itemCount}</Badge>
            </div>
          </Panel>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-white/40">
          {filtered.length} items · stored locally · private
        </p>
        <Button size="sm" variant="outline" onClick={() => void provider.authorizeRoot()}>
          <FolderPlus size={14} /> Authorize folder
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {filtered.map((item) => (
          <div
            key={item.id}
            className="group relative aspect-video overflow-hidden rounded-xl border border-white/[0.06]"
            style={{ background: item.thumbnailColor }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
            {item.favorite && (
              <Star size={14} className="absolute right-2 top-2 fill-ember text-ember" />
            )}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
              <Play size={24} className="text-white" />
            </div>
            <div className="absolute inset-x-0 bottom-0 p-2.5">
              <p className="truncate text-sm text-white/90">{item.title}</p>
              <div className="mt-0.5 flex items-center justify-between text-[11px] text-white/40">
                <span>{formatRelativeTime(item.addedAt)}</span>
                <span className="font-mono">{formatDuration(item.durationSeconds)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
