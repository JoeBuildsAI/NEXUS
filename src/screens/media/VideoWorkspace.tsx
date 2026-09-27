import { useMemo, useState } from "react";
import { Check, Layers, Link2, Link2Off, Pause, Pencil, Play, Save, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { PlayerSlotView } from "./PlayerSlotView";
import { MediaPicker } from "./MediaPicker";
import { Button } from "@/components/ui";
import { LAYOUTS, useMediaStore, type LayoutId } from "@/state/mediaStore";
import { notify } from "@/state/toastStore";
import { requestConfirm } from "@/state/confirmStore";
import type { MediaItem } from "@/core/types";
import { cn } from "@/lib/utils";

interface Props {
  items: readonly MediaItem[];
}

export function VideoWorkspace({ items }: Props) {
  const {
    slots, layout, focusIndex, syncPlayback, savedLayouts,
    setSlotItem, setLayout, setFocusIndex, playAll, pauseAll, muteAll, clearAll,
    setSyncPlayback, saveLayout, renameLayout, restoreLayout, deleteLayout,
  } = useMediaStore();
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const loaded = slots.filter((s) => s.itemId).length;
  const anyMuted = slots.some((s) => s.itemId && s.muted);
  const spec = LAYOUTS[layout];
  const visible = slots.slice(0, spec.slots);

  const onSave = () => {
    const name = `Layout ${savedLayouts.length + 1}`;
    saveLayout(name);
    notify.success("Workspace saved", name);
  };
  const onClear = () => {
    if (loaded === 0) return;
    requestConfirm({ title: "Clear all players?", message: "Removes every loaded video from the workspace. Your files are untouched.", confirmLabel: "Clear", danger: true, onConfirm: () => { clearAll(); notify.neutral("Workspace cleared"); } });
  };

  const renderSlot = (index: number, large = false, className?: string) => {
    const slot = slots[index]!;
    return <PlayerSlotView key={slot.index} slot={slot} item={slot.itemId ? itemById.get(slot.itemId) ?? null : null} onAssign={setPickerSlot} large={large} className={className} />;
  };

  return (
    <div className="flex h-full flex-col gap-5">
      {/* Master controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="primary" onClick={playAll} disabled={loaded === 0}><Play size={14} fill="currentColor" /> Play all</Button>
          <Button size="sm" variant="outline" onClick={pauseAll} disabled={loaded === 0}><Pause size={14} /> Pause all</Button>
          <Button size="sm" variant="outline" onClick={() => muteAll(!anyMuted)} disabled={loaded === 0}>
            {anyMuted ? <Volume2 size={14} /> : <VolumeX size={14} />} {anyMuted ? "Unmute all" : "Mute all"}
          </Button>
          <button
            onClick={() => setSyncPlayback(!syncPlayback)}
            title="Sync playback: play, pause and seek are mirrored across all loaded players"
            className={cn("flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors", syncPlayback ? "border-accent/40 bg-accent/10 text-accent" : "border-white/10 text-white/50 hover:text-white/80")}
          >
            {syncPlayback ? <Link2 size={13} /> : <Link2Off size={13} />} Sync
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-1">
            {(Object.keys(LAYOUTS) as LayoutId[]).map((id) => (
              <button key={id} onClick={() => setLayout(id)} className={cn("rounded-md px-2.5 py-1 text-xs transition-colors", layout === id ? "bg-accent/15 text-accent" : "text-white/50 hover:text-white/80")}>
                {LAYOUTS[id].label}
              </button>
            ))}
          </div>
          <Button size="sm" variant="ghost" onClick={onSave}><Save size={14} /> Save</Button>
          <Button size="sm" variant="ghost" onClick={onClear} disabled={loaded === 0}><Trash2 size={14} /> Clear</Button>
        </div>
      </div>

      {/* Saved layouts */}
      {savedLayouts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-1.5 text-white/35"><Layers size={13} /> Saved</span>
          {savedLayouts.map((l) => (
            <div key={l.id} className="group flex items-center overflow-hidden rounded-md border border-white/[0.08]">
              {renaming?.id === l.id ? (
                <>
                  <input autoFocus value={renaming.name} onChange={(e) => setRenaming({ id: l.id, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { renameLayout(l.id, renaming.name.trim() || l.name); setRenaming(null); } if (e.key === "Escape") setRenaming(null); }} className="h-7 w-28 bg-transparent px-2 text-white/85 focus:outline-none" />
                  <button onClick={() => { renameLayout(l.id, renaming.name.trim() || l.name); setRenaming(null); }} className="px-2 text-accent"><Check size={12} /></button>
                </>
              ) : (
                <>
                  <button onClick={() => { restoreLayout(l.id); notify.neutral(`Restored “${l.name}”`); }} className="h-7 px-2.5 text-white/65 hover:bg-white/[0.05] hover:text-accent">{l.name}</button>
                  <button onClick={() => setRenaming({ id: l.id, name: l.name })} className="h-7 px-1.5 text-white/30 opacity-0 transition-opacity hover:text-white group-hover:opacity-100" title="Rename"><Pencil size={11} /></button>
                  <button onClick={() => deleteLayout(l.id)} className="h-7 px-1.5 text-white/30 opacity-0 transition-opacity hover:text-status-critical group-hover:opacity-100" title="Delete"><X size={12} /></button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Grid */}
      <div className="min-h-0 flex-1">
        {layout === "3x2" || layout === "2x3" ? (
          <div className="grid h-full content-start gap-3" style={{ gridTemplateColumns: `repeat(${spec.columns}, minmax(0, 1fr))` }}>
            {visible.map((s) => renderSlot(s.index))}
          </div>
        ) : layout === "2x2-primary" ? (
          <div className="grid h-full gap-3" style={{ gridTemplateColumns: "2fr 1fr", gridTemplateRows: "1fr 1fr 1fr 1fr" }}>
            {renderSlot(0, true, "row-span-4")}
            {renderSlot(1)}
            {renderSlot(2)}
            {renderSlot(3)}
            {renderSlot(4)}
          </div>
        ) : (
          <div className="flex h-full flex-col gap-3">
            <div className="min-h-0 flex-1">{renderSlot(focusIndex, true, "h-full")}</div>
            <div className="grid grid-cols-6 gap-2">
              {slots.map((s) => (
                <button key={s.index} onClick={() => setFocusIndex(s.index)} className={cn("relative aspect-video overflow-hidden rounded-md border text-left transition-colors", focusIndex === s.index ? "border-accent/60" : "border-white/[0.06] hover:border-white/20")} style={{ background: s.itemId ? itemById.get(s.itemId)?.thumbnailColor : "rgba(255,255,255,0.02)" }}>
                  <span className="absolute left-1.5 top-1 font-mono text-[9px] text-white/60">P{s.index + 1}</span>
                  {s.itemId && <span className="absolute inset-x-1.5 bottom-1 truncate text-[10px] text-white/80">{itemById.get(s.itemId)?.title}</span>}
                  {s.playing && <span className="absolute right-1.5 top-1 h-1.5 w-1.5 rounded-full bg-accent" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <MediaPicker
        open={pickerSlot !== null}
        items={items}
        onClose={() => setPickerSlot(null)}
        onPick={(item) => {
          if (pickerSlot !== null) setSlotItem(pickerSlot, item.id);
          setPickerSlot(null);
        }}
      />
    </div>
  );
}
