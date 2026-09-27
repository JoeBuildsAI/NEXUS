import { useMemo, useState } from "react";
import { LayoutGroup } from "framer-motion";
import { Check, Link2, Pause, Pencil, Play, Save, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { PlayerSlotView } from "./PlayerSlotView";
import { MediaPicker } from "./MediaPicker";
import { LAYOUTS, useMediaStore, type LayoutId } from "@/state/mediaStore";
import { notify } from "@/state/toastStore";
import { requestConfirm } from "@/state/confirmStore";
import type { MediaItem } from "@/core/types";
import { cn } from "@/lib/utils";

interface Props {
  items: readonly MediaItem[];
}

/** Six-player wall. Players float on black; one quiet control bar, centered. */
export function VideoWorkspace({ items }: Props) {
  const { slots, layout, focusIndex, syncPlayback, savedLayouts, setSlotItem, setLayout, setFocusIndex, playAll, pauseAll, muteAll, clearAll, setSyncPlayback, saveLayout, renameLayout, restoreLayout, deleteLayout } = useMediaStore();
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const loaded = slots.filter((s) => s.itemId).length;
  const anyPlaying = slots.some((s) => s.itemId && s.playing);
  const anyMuted = slots.some((s) => s.itemId && s.muted);
  const spec = LAYOUTS[layout];
  const visible = slots.slice(0, spec.slots);

  const onClear = () => {
    if (loaded === 0) return;
    requestConfirm({ title: "Clear all players?", message: "Unloads every video from the workspace. Your files are untouched.", confirmLabel: "Clear", danger: true, onConfirm: () => { clearAll(); notify.neutral("Workspace cleared"); } });
  };
  const renderSlot = (index: number, large = false, className?: string) => {
    const slot = slots[index]!;
    return <PlayerSlotView key={slot.index} slot={slot} item={slot.itemId ? itemById.get(slot.itemId) ?? null : null} onAssign={setPickerSlot} large={large} className={className} />;
  };

  return (
    <div className="flex h-full flex-col gap-5">
      {/* Control bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <Ctl onClick={anyPlaying ? pauseAll : playAll} disabled={loaded === 0} label={anyPlaying ? "Pause all" : "Play all"} primary>{anyPlaying ? <Pause size={14} /> : <Play size={14} fill="currentColor" />}</Ctl>
          <Ctl onClick={() => muteAll(!anyMuted)} disabled={loaded === 0} label={anyMuted ? "Unmute all" : "Mute all"}>{anyMuted ? <Volume2 size={14} /> : <VolumeX size={14} />}</Ctl>
          <Ctl onClick={() => setSyncPlayback(!syncPlayback)} label="Sync playback (play, pause and seek mirror across players)" active={syncPlayback}><Link2 size={14} /></Ctl>
          <span className="ml-3 font-mono text-[11px] tabular text-white/30">{loaded} / {spec.slots} loaded{syncPlayback ? " · synced" : ""}</span>
        </div>

        <div className="flex items-center gap-5">
          <div className="flex items-center gap-4 text-[12.5px]">
            {(Object.keys(LAYOUTS) as LayoutId[]).map((id) => (
              <button key={id} onClick={() => setLayout(id)} className={cn("relative pb-1 transition-colors", layout === id ? "text-white" : "text-white/35 hover:text-white/70")}>
                {LAYOUTS[id].label}
                {layout === id && <span className="absolute inset-x-0 -bottom-px h-px bg-white" />}
              </button>
            ))}
          </div>
          <span className="h-4 w-px bg-white/10" />
          <Ctl onClick={() => { const name = `Layout ${savedLayouts.length + 1}`; saveLayout(name); notify.success("Workspace saved", name); }} label="Save layout"><Save size={14} /></Ctl>
          <Ctl onClick={onClear} disabled={loaded === 0} label="Clear all"><Trash2 size={14} /></Ctl>
        </div>
      </div>

      {savedLayouts.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px]">
          <span className="label">Saved</span>
          {savedLayouts.map((l) => (
            <div key={l.id} className="group flex items-center gap-1.5">
              {renaming?.id === l.id ? (
                <>
                  <input autoFocus value={renaming.name} onChange={(e) => setRenaming({ id: l.id, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { renameLayout(l.id, renaming.name.trim() || l.name); setRenaming(null); } if (e.key === "Escape") setRenaming(null); }} className="h-6 w-28 border-b border-white/30 bg-transparent text-white/85 focus:outline-none" />
                  <button onClick={() => { renameLayout(l.id, renaming.name.trim() || l.name); setRenaming(null); }} className="text-white/70"><Check size={12} /></button>
                </>
              ) : (
                <>
                  <button onClick={() => { restoreLayout(l.id); notify.neutral(`Restored ${l.name}`); }} className="text-white/60 transition-colors hover:text-white">{l.name}</button>
                  <button onClick={() => setRenaming({ id: l.id, name: l.name })} className="text-white/25 opacity-0 transition-opacity hover:text-white group-hover:opacity-100" title="Rename"><Pencil size={11} /></button>
                  <button onClick={() => deleteLayout(l.id)} className="text-white/25 opacity-0 transition-opacity hover:text-status-critical group-hover:opacity-100" title="Delete"><X size={12} /></button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Wall */}
      <LayoutGroup>
        <div className="min-h-0 flex-1">
          {layout === "3x2" || layout === "2x3" ? (
            // The wall fills the viewport like a professional multiview; videos letterbox inside cells.
            <div className="grid h-full gap-2" style={{ gridTemplateColumns: `repeat(${spec.columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${spec.rows}, minmax(0, 1fr))` }}>
              {visible.map((s) => renderSlot(s.index, true, "min-h-0"))}
            </div>
          ) : layout === "2x2-primary" ? (
            <div className="grid h-full gap-2" style={{ gridTemplateColumns: "2fr 1fr", gridTemplateRows: "repeat(4, minmax(0, 1fr))" }}>
              {renderSlot(0, true, "row-span-4")}
              {renderSlot(1)}
              {renderSlot(2)}
              {renderSlot(3)}
              {renderSlot(4)}
            </div>
          ) : (
            <div className="flex h-full flex-col gap-2">
              <div className="min-h-0 flex-1">{renderSlot(focusIndex, true, "h-full")}</div>
              <div className="grid grid-cols-6 gap-2">
                {slots.map((s) => (
                  <button key={s.index} onClick={() => setFocusIndex(s.index)} className={cn("relative aspect-video overflow-hidden rounded-sm text-left transition-opacity", focusIndex === s.index ? "opacity-100 ring-1 ring-white/50" : "opacity-50 hover:opacity-90")} style={{ background: s.itemId ? itemById.get(s.itemId)?.thumbnailColor : "rgba(255,255,255,0.02)" }} aria-label={`Focus player ${s.index + 1}`}>
                    <span className="absolute left-1.5 top-1 font-mono text-[9px] text-white/60">P{s.index + 1}</span>
                    {s.itemId && <span className="absolute inset-x-1.5 bottom-1 truncate text-[10px] text-white/80">{itemById.get(s.itemId)?.title}</span>}
                    {s.playing && <span className="absolute right-1.5 top-1.5 h-1 w-1 rounded-full bg-white" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </LayoutGroup>

      <MediaPicker open={pickerSlot !== null} items={items} onClose={() => setPickerSlot(null)} onPick={(item) => { if (pickerSlot !== null) setSlotItem(pickerSlot, item.id); setPickerSlot(null); }} />
    </div>
  );
}

function Ctl({ children, onClick, label, disabled, active, primary }: { children: React.ReactNode; onClick: () => void; label: string; disabled?: boolean; active?: boolean; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-md transition-colors disabled:opacity-30",
        primary ? "bg-white text-black hover:bg-white/90" : active ? "bg-white/[0.12] text-white" : "text-white/55 hover:bg-white/[0.06] hover:text-white",
      )}
    >
      {children}
    </button>
  );
}
