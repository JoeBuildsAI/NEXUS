import { AnimatePresence, motion } from "framer-motion";
import { Play } from "lucide-react";
import type { MediaItem } from "@/core/types";
import { Panel } from "@/components/ui";
import { formatDuration } from "@/lib/utils";

interface Props {
  open: boolean;
  items: readonly MediaItem[];
  onPick: (item: MediaItem) => void;
  onClose: () => void;
}

/** Modal to select a local media item for a workspace slot. */
export function MediaPicker({ open, items, onPick, onClose }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[160] flex items-center justify-center p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-void-950/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.97, opacity: 0 }}
            className="relative w-full max-w-3xl"
          >
            <Panel strong className="max-h-[70vh] overflow-hidden p-5">
              <h2 className="text-sm font-medium uppercase tracking-wide2 text-white/60">
                Select media
              </h2>
              <div className="mt-4 grid max-h-[56vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onPick(item)}
                    className="group relative aspect-video overflow-hidden rounded-lg border border-white/[0.06] text-left transition-colors hover:border-accent/40"
                    style={{ background: item.thumbnailColor }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                      <Play size={22} className="text-white" />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between p-2">
                      <span className="truncate text-xs text-white/90">{item.title}</span>
                      <span className="shrink-0 font-mono text-[10px] text-white/60">
                        {formatDuration(item.durationSeconds)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </Panel>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
