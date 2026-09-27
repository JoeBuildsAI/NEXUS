import { useEffect, useRef, useState } from "react";
import { Focus, Maximize2, Pause, Play, Plus, RefreshCw, Volume2, VolumeX, X } from "lucide-react";
import type { MediaItem, PlayerSlot } from "@/core/types";
import { useMediaStore } from "@/state/mediaStore";
import { formatDuration } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Props {
  slot: PlayerSlot;
  item: MediaItem | null;
  onAssign: (index: number) => void;
  large?: boolean;
  className?: string;
}

/** A single video player within the workspace grid. */
export function PlayerSlotView({ slot, item, onAssign, large, className }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { setSlotPlaying, setSlotMuted, setSlotVolume, clearSlot, requestSeek, setFocusIndex, setLayout } = useMediaStore();
  const seekRequest = useMediaStore((s) => s.seekRequest);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [errored, setErrored] = useState(false);
  const lastSeq = useRef(0);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (slot.playing) void v.play().catch(() => setSlotPlaying(slot.index, false));
    else v.pause();
  }, [slot.playing, slot.index, setSlotPlaying]);

  useEffect(() => { if (videoRef.current) videoRef.current.muted = slot.muted; }, [slot.muted]);
  useEffect(() => { if (videoRef.current) videoRef.current.volume = slot.volume; }, [slot.volume]);

  // Apply broadcast seeks (sync) or targeted seeks.
  useEffect(() => {
    if (!seekRequest || seekRequest.seq === lastSeq.current) return;
    lastSeq.current = seekRequest.seq;
    if (seekRequest.only != null && seekRequest.only !== slot.index) return;
    const v = videoRef.current;
    if (v && Number.isFinite(seekRequest.time)) v.currentTime = Math.min(seekRequest.time, v.duration || seekRequest.time);
  }, [seekRequest, slot.index]);

  useEffect(() => { setErrored(item?.available === false); setProgress(0); }, [item?.id, item?.available]);

  if (!item) {
    return (
      <button
        onClick={() => onAssign(slot.index)}
        className={cn("group relative flex items-center justify-center rounded-xl border border-dashed border-white/[0.08] bg-white/[0.012] transition-colors hover:border-accent/30 hover:bg-accent/[0.03]", large ? "" : "aspect-video", className)}
      >
        <div className="flex flex-col items-center gap-2 text-white/25 transition-colors group-hover:text-accent/70">
          <Plus size={large ? 28 : 20} />
          <span className="text-[11px] uppercase tracking-wide2">Player {slot.index + 1}</span>
        </div>
      </button>
    );
  }

  const pct = duration ? (progress / duration) * 100 : 0;

  return (
    <div className={cn("group relative overflow-hidden rounded-xl bg-black ring-1 ring-white/[0.06] transition-shadow hover:ring-white/15", large ? "" : "aspect-video", className)}>
      {errored ? (
        <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 px-4 text-center text-white/35" style={{ background: item.thumbnailColor }}>
          <RefreshCw size={18} />
          <p className="text-xs uppercase tracking-wide2">{item.available === false ? "Media source unavailable" : item.playability === "potentially-unsupported" ? `${item.ext?.toUpperCase()} not playable here` : "Source unavailable"}</p>
          <p className="max-w-[220px] truncate text-[11px] text-white/45">{item.title}</p>
          <div className="flex gap-3 text-[11px]">
            <button onClick={() => onAssign(slot.index)} className="text-accent hover:underline">Replace</button>
            <button onClick={() => clearSlot(slot.index)} className="text-white/50 hover:underline">Clear</button>
          </div>
        </div>
      ) : (
        <video
          ref={videoRef}
          src={item.src}
          loop
          playsInline
          preload="metadata"
          onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onError={() => setErrored(true)}
          className="h-full w-full object-cover"
          style={{ background: item.thumbnailColor }}
        />
      )}

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
        <span className="truncate text-xs font-medium text-white/90">
          <span className="mr-2 font-mono text-[10px] text-white/40">P{slot.index + 1}</span>{item.title}
        </span>
        <div className="pointer-events-auto flex gap-0.5">
          <IconBtn onClick={() => onAssign(slot.index)} label="Replace"><RefreshCw size={13} /></IconBtn>
          <IconBtn onClick={() => clearSlot(slot.index)} label="Clear"><X size={14} /></IconBtn>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-2 pt-6 opacity-0 transition-opacity group-hover:opacity-100">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={progress}
          onChange={(e) => { const t = Number(e.target.value); setProgress(t); requestSeek(t, slot.index); }}
          className="mb-1.5 h-1 w-full cursor-pointer appearance-none rounded-full [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent"
          style={{ background: `linear-gradient(90deg, rgba(94,208,230,0.9) ${pct}%, rgba(255,255,255,0.15) ${pct}%)` }}
        />
        <div className="flex items-center gap-1.5">
          <IconBtn onClick={() => setSlotPlaying(slot.index, !slot.playing)} label={slot.playing ? "Pause" : "Play"}>
            {slot.playing ? <Pause size={15} /> : <Play size={15} />}
          </IconBtn>
          <IconBtn onClick={() => setSlotMuted(slot.index, !slot.muted)} label={slot.muted ? "Unmute" : "Mute"}>
            {slot.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </IconBtn>
          <input
            type="range" min={0} max={1} step={0.05} value={slot.volume}
            onChange={(e) => setSlotVolume(slot.index, Number(e.target.value))}
            className="h-1 w-14 cursor-pointer appearance-none rounded-full bg-white/20 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
          />
          <span className="ml-1 font-mono text-[10px] tabular-nums text-white/60">{formatDuration(progress)} / {formatDuration(duration)}</span>
          <div className="ml-auto flex gap-0.5">
            <IconBtn onClick={() => { setFocusIndex(slot.index); setLayout("focus"); }} label="Focus"><Focus size={14} /></IconBtn>
            <IconBtn onClick={() => void videoRef.current?.requestFullscreen?.()} label="Fullscreen"><Maximize2 size={14} /></IconBtn>
          </div>
        </div>
      </div>

      {!slot.playing && !errored && (
        <button onClick={() => setSlotPlaying(slot.index, true)} className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100" aria-label="Play">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur"><Play size={20} className="ml-0.5" /></span>
        </button>
      )}
    </div>
  );
}

function IconBtn({ children, onClick, label, className }: { children: React.ReactNode; onClick: () => void; label: string; className?: string }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className={cn("flex h-7 w-7 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/15 hover:text-white", className)}>
      {children}
    </button>
  );
}
