import { memo, useEffect, useState } from "react";
import { Film, FolderOpen, RefreshCw } from "lucide-react";
import type { VideoEntry } from "@/core/native";
import { native } from "@/core/native";
import { usePlayer } from "@/state/player";
import { useThumbnail } from "@/hooks/useThumbnail";
import { cn, formatBytes } from "@/lib/format";

/** The other videos in the same folder, with real frames from each file. */
export function FolderPanel() {
  const listing = usePlayer((s) => s.listing);
  const current = usePlayer((s) => s.current);
  const refresh = usePlayer((s) => s.refresh);
  const openFolder = usePlayer((s) => s.openFolder);
  if (!listing) return null;

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col border-l border-white/[0.06] bg-[#050505]">
      <header className="flex items-center gap-2 px-4 pb-3 pt-4">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">In this folder</p>
          <p className="truncate text-[14px] font-medium text-white/85" title={listing.folder}>{listing.folderName}</p>
        </div>
        <span className="font-mono text-[11px] text-white/35">{listing.videos.length}</span>
        <IconBtn label="Refresh folder" onClick={() => void refresh()}><RefreshCw size={14} /></IconBtn>
        <IconBtn label="Open another folder" onClick={async () => { const p = await native.pickFolder(); if (p) void openFolder(p); }}><FolderOpen size={15} /></IconBtn>
      </header>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-4">
        {listing.videos.map((v) => <Item key={v.path} video={v} active={v.path === current} />)}
        {!listing.videos.length && <p className="px-3 py-6 text-center text-[13px] text-white/40">No videos in this folder.</p>}
        {listing.truncated && <p className="px-3 py-2 text-[11px] text-white/35">Showing the first {listing.videos.length} videos.</p>}
      </div>
    </aside>
  );
}

const Item = memo(function Item({ video, active }: { video: VideoEntry; active: boolean }) {
  const [node, setNode] = useState<HTMLButtonElement | null>(null);
  const thumb = useThumbnail(video.path, node);
  const select = usePlayer((s) => s.select);

  useEffect(() => {
    if (active && node) node.scrollIntoView({ block: "nearest" });
  }, [active, node]);

  return (
    <button
      ref={setNode}
      onClick={() => select(video.path)}
      aria-current={active ? "true" : undefined}
      className={cn("group flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors", active ? "bg-white/[0.09]" : "hover:bg-white/[0.04]")}
    >
      <div className={cn("relative aspect-video w-[132px] shrink-0 overflow-hidden rounded-[4px] bg-white/[0.04]", active && "ring-1 ring-sky-400/80")}>
        {thumb ? (
          <img src={thumb} alt="" draggable={false} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          <div className={cn("flex h-full w-full items-center justify-center text-white/20", thumb === undefined && "animate-pulse")}>
            <Film size={18} />
          </div>
        )}
        {active && <span className="absolute bottom-1 left-1 rounded-[3px] bg-sky-400 px-1 text-[9px] font-semibold uppercase tracking-wider text-black">Playing</span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("line-clamp-2 break-words text-[13px] leading-snug", active ? "text-white" : "text-white/75")}>{video.name}</p>
        <p className="mt-1 font-mono text-[10px] uppercase text-white/35">
          {video.ext} · {formatBytes(video.sizeBytes)}
          {!video.playable && <span className="ml-1 normal-case text-amber-300/70">· may not play</span>}
        </p>
      </div>
    </button>
  );
});

function IconBtn({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} className="flex h-7 w-7 items-center justify-center rounded text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white">
      {children}
    </button>
  );
}
