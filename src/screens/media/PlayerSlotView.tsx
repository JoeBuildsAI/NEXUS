import { useEffect, useRef } from "react";
import {
  Maximize2,
  Pause,
  Play,
  Plus,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { MediaItem, PlayerSlot } from "@/core/types";
import { useMediaStore } from "@/state/mediaStore";
import { cn } from "@/lib/utils";

interface Props {
  slot: PlayerSlot;
  item: MediaItem | null;
  onAssign: (index: number) => void;
}

/** A single video player within the workspace grid. */
export function PlayerSlotView({ slot, item, onAssign }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { setSlotPlaying, setSlotMuted, setSlotVolume, clearSlot } = useMediaStore();

  // Sync store playing state to the actual media element.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (slot.playing) void v.play().catch(() => setSlotPlaying(slot.index, false));
    else v.pause();
  }, [slot.playing, slot.index, setSlotPlaying]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = slot.muted;
  }, [slot.muted]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = slot.volume;
  }, [slot.volume]);

  const fullscreen = () => void videoRef.current?.requestFullscreen?.();

  if (!item) {
    return (
      <button
        onClick={() => onAssign(slot.index)}
        className="group relative flex aspect-video items-center justify-center rounded-xl border border-dashed border-white/[0.08] bg-white/[0.015] transition-colors hover:border-accent/30 hover:bg-accent/[0.03]"
      >
        <div className="flex flex-col items-center gap-2 text-white/25 transition-colors group-hover:text-accent/70">
          <Plus size={22} />
          <span className="text-xs">Player {slot.index + 1}</span>
        </div>
      </button>
    );
  }

  return (
    <div className="group relative aspect-video overflow-hidden rounded-xl border border-white/[0.08] bg-black">
      <video
        ref={videoRef}
        src={item.src}
        loop
        playsInline
        className="h-full w-full object-cover"
        style={{ background: item.thumbnailColor }}
      />

      {/* Top overlay */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
        <span className="truncate text-xs font-medium text-white/90">
          {item.title}
        </span>
        <button
          onClick={() => clearSlot(slot.index)}
          className="pointer-events-auto flex h-6 w-6 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white"
          aria-label="Clear slot"
        >
          <X size={14} />
        </button>
      </div>

      {/* Bottom controls */}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
        <IconBtn
          onClick={() => setSlotPlaying(slot.index, !slot.playing)}
          label={slot.playing ? "Pause" : "Play"}
        >
          {slot.playing ? <Pause size={15} /> : <Play size={15} />}
        </IconBtn>
        <IconBtn
          onClick={() => setSlotMuted(slot.index, !slot.muted)}
          label={slot.muted ? "Unmute" : "Mute"}
        >
          {slot.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </IconBtn>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={slot.volume}
          onChange={(e) => setSlotVolume(slot.index, Number(e.target.value))}
          className="h-1 w-16 cursor-pointer appearance-none rounded-full bg-white/20 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent"
        />
        <IconBtn onClick={fullscreen} label="Fullscreen" className="ml-auto">
          <Maximize2 size={14} />
        </IconBtn>
      </div>

      {!slot.playing && (
        <button
          onClick={() => setSlotPlaying(slot.index, true)}
          className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur">
            <Play size={20} />
          </span>
        </button>
      )}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  label,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/15 hover:text-white",
        className,
      )}
    >
      {children}
    </button>
  );
}
