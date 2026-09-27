import { useMemo, useState } from "react";
import {
  Grid2x2,
  Layers,
  Pause,
  Play,
  Save,
  Trash2,
  VolumeX,
} from "lucide-react";
import { PlayerSlotView } from "./PlayerSlotView";
import { MediaPicker } from "./MediaPicker";
import { Button } from "@/components/ui";
import { useMediaStore } from "@/state/mediaStore";
import { useAsync } from "@/hooks/useAsync";
import { getProviders } from "@/providers";
import type { MediaItem } from "@/core/types";

const GRID_PRESETS = [
  { columns: 2, rows: 1, label: "2×1" },
  { columns: 2, rows: 2, label: "2×2" },
  { columns: 3, rows: 2, label: "3×2" },
  { columns: 3, rows: 3, label: "3×3" },
];

export function VideoWorkspace() {
  const { data: items } = useAsync<readonly MediaItem[]>(
    () => getProviders().media.getItems(),
    [],
  );
  const {
    slots,
    columns,
    rows,
    setSlotItem,
    setGrid,
    playAll,
    pauseAll,
    muteAll,
    clearAll,
    saveLayout,
    savedLayouts,
    restoreLayout,
  } = useMediaStore();

  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const itemById = useMemo(() => {
    const map = new Map<string, MediaItem>();
    for (const i of items ?? []) map.set(i.id, i);
    return map;
  }, [items]);

  const visibleSlots = slots.slice(0, columns * rows);

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="primary" onClick={playAll}>
            <Play size={14} /> Play all
          </Button>
          <Button size="sm" variant="outline" onClick={pauseAll}>
            <Pause size={14} /> Pause all
          </Button>
          <Button size="sm" variant="outline" onClick={() => muteAll(true)}>
            <VolumeX size={14} /> Mute all
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-1">
            <Grid2x2 size={13} className="ml-1 text-white/30" />
            {GRID_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setGrid(p.columns, p.rows)}
                className={`rounded-md px-2 py-1 text-xs transition-colors ${
                  columns === p.columns && rows === p.rows
                    ? "bg-accent/15 text-accent"
                    : "text-white/50 hover:text-white/80"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => saveLayout(`Layout ${savedLayouts.length + 1}`)}
          >
            <Save size={14} /> Save
          </Button>
          <Button size="sm" variant="ghost" onClick={clearAll}>
            <Trash2 size={14} /> Clear
          </Button>
        </div>
      </div>

      {/* Saved layouts */}
      {savedLayouts.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-white/40">
          <Layers size={13} />
          <span>Layouts:</span>
          {savedLayouts.map((l) => (
            <button
              key={l.id}
              onClick={() => restoreLayout(l.id)}
              className="rounded-md border border-white/[0.08] px-2 py-1 text-white/60 hover:border-accent/30 hover:text-accent"
            >
              {l.name}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      <div
        className="grid min-h-0 flex-1 content-start gap-3"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {visibleSlots.map((slot) => (
          <PlayerSlotView
            key={slot.index}
            slot={slot}
            item={slot.itemId ? itemById.get(slot.itemId) ?? null : null}
            onAssign={setPickerSlot}
          />
        ))}
      </div>

      <MediaPicker
        open={pickerSlot !== null}
        items={items ?? []}
        onClose={() => setPickerSlot(null)}
        onPick={(item) => {
          if (pickerSlot !== null) setSlotItem(pickerSlot, item.id);
          setPickerSlot(null);
        }}
      />
    </div>
  );
}
