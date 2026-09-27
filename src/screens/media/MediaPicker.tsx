import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search } from "lucide-react";
import type { MediaItem } from "@/core/types";
import { formatDuration } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  items: readonly MediaItem[];
  onPick: (item: MediaItem) => void;
  onClose: () => void;
}

/** Choose a local video for a slot. Typographic list with local search. */
export function MediaPicker({ open, items, onPick, onClose }: Props) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (t ? items.filter((i) => i.title.toLowerCase().includes(t) || (i.folder ?? "").toLowerCase().includes(t)) : items).slice(0, 60);
  }, [items, q]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[160] flex items-start justify-center pt-[12vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
          <motion.div initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -4, opacity: 0 }} className="relative w-full max-w-2xl px-8" role="dialog" aria-label="Select media">
            <div className="flex items-center gap-3">
              <Search size={16} className="text-white/30" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onClose()} placeholder="Choose a video" className="h-12 w-full bg-transparent font-display text-display-sm font-light text-white placeholder:text-white/25 focus:outline-none" />
            </div>
            <div className="mt-1 h-px bg-gradient-to-r from-white/20 to-transparent" />
            <div className="mt-4 max-h-[52vh] overflow-y-auto">
              {filtered.length === 0 && <p className="py-6 text-sm text-white/30">No local matches.</p>}
              {filtered.map((item) => (
                <button key={item.id} onClick={() => onPick(item)} disabled={item.available === false} className={cn("group flex w-full items-center gap-4 py-2 text-left", item.available === false && "opacity-40")}>
                  <span className="h-8 w-14 shrink-0 rounded-sm" style={{ background: item.thumbnailColor }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-white/80 transition-colors group-hover:text-white">{item.title}</span>
                    {item.folder && <span className="block truncate text-[11px] text-white/30">{item.folder.split("\\").pop()}</span>}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-white/35">{item.durationSeconds ? formatDuration(item.durationSeconds) : item.ext?.toUpperCase()}</span>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
