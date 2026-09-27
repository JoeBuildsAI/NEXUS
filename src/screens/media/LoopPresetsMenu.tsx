import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { MediaItem, PlayerSlot } from "@/core/types";
import { useLoopPresetsStore } from "@/state/loopPresetsStore";
import { useMediaStore } from "@/state/mediaStore";
import { formatClock } from "@/core/media/loop";
import { notify } from "@/state/toastStore";

/** Per-file saved segments. Local only; keyed by the file's hashed id. */
export function LoopPresetsMenu({ slot, item, duration, onClose }: { slot: PlayerSlot; item: MediaItem; duration: number | null; onClose: () => void }) {
  const presets = useLoopPresetsStore((s) => s.presets.filter((p) => p.itemId === item.id));
  const { save, remove, rename } = useLoopPresetsStore();
  const setSegment = useMediaStore((s) => s.setSegment);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const hasSegment = slot.loopA != null && slot.loopB != null;

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey, true); };
  }, [onClose]);

  const saveCurrent = () => {
    if (!hasSegment) return;
    const p = save({ itemId: item.id, rootId: item.rootId ?? null, name: name || `${formatClock(slot.loopA!)} → ${formatClock(slot.loopB!)}`, a: slot.loopA!, b: slot.loopB! });
    setName("");
    notify.success("Loop saved", p.name);
  };
  const load = (a: number, b: number) => {
    const err = setSegment(slot.index, a, b, duration);
    if (err) notify.warn("Preset doesn't fit this file", "The saved segment lies outside the current duration.");
    else onClose();
  };

  return (
    <div ref={ref} className="glass-strong absolute bottom-16 right-3 z-10 w-72 rounded-md p-4" onMouseDown={(e) => e.stopPropagation()}>
      <p className="text-micro text-white/45">Loop presets · this file</p>
      <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto">
        {presets.length === 0 && <li className="py-2 text-[12.5px] text-white/35">No saved segments yet.</li>}
        {presets.map((p) => (
          <li key={p.id} className="group flex items-center gap-2">
            {renaming === p.id ? (
              <input autoFocus defaultValue={p.name} onBlur={(e) => { rename(p.id, e.target.value); setRenaming(null); }} onKeyDown={(e) => { if (e.key === "Enter") { rename(p.id, (e.target as HTMLInputElement).value); setRenaming(null); } }} className="h-7 flex-1 border-b border-white/20 bg-transparent text-[13px] text-white focus:outline-none" />
            ) : (
              <button onClick={() => load(p.a, p.b)} onDoubleClick={() => setRenaming(p.id)} className="flex flex-1 items-baseline justify-between gap-3 py-1 text-left" title="Load · double-click to rename">
                <span className="truncate text-[13px] text-white/85">{p.name}</span>
                <span className="shrink-0 font-mono text-[10.5px] tabular text-white/40">{formatClock(p.a)}–{formatClock(p.b)}</span>
              </button>
            )}
            <button onClick={() => remove(p.id)} aria-label="Delete preset" className="text-white/25 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"><Trash2 size={12} /></button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-2 border-t border-white/[0.08] pt-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={hasSegment ? "Name this segment" : "Set A and B first"} disabled={!hasSegment} onKeyDown={(e) => e.key === "Enter" && saveCurrent()} className="h-8 flex-1 border-b border-white/15 bg-transparent text-[13px] text-white placeholder:text-white/25 focus:border-white/50 focus:outline-none disabled:opacity-40" />
        <button onClick={saveCurrent} disabled={!hasSegment} className="text-[12.5px] text-white/70 transition-colors hover:text-white disabled:opacity-30">Save</button>
      </div>
    </div>
  );
}
