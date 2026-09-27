import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
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

/** A player floating on black. Controls only exist while the pointer is over it. */
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
      <motion.button layout onClick={() => onAssign(slot.index)} className={cn("group relative flex items-center justify-center rounded-sm bg-white/[0.015] transition-colors hover:bg-white/[0.035]", large ? "" : "aspect-video", className)} aria-label={`Load player ${slot.index + 1}`}>
        <span className="absolute left-3 top-2.5 font-mono text-[10px] text-white/20">P{slot.index + 1}</span>
        <Plus size={large ? 24 : 18} strokeWidth={1.5} className="text-white/20 transition-colors group-hover:text-white/60" />
      </motion.button>
    );
  }

  const pct = duration ? (progress / duration) * 100 : 0;

  return (
    <motion.div layout className={cn("group relative overflow-hidden rounded-sm bg-black", large ? "" : "aspect-video", className)}>
      {errored ? (
        <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 px-4 text-center" style={{ background: `radial-gradient(80% 80% at 50% 50%, ${item.thumbnailColor}22, #000)` }}>
          <p className="text-micro text-white/40">{item.available === false ? "Source unavailable" : item.playability === "potentially-unsupported" ? `${item.ext?.toUpperCase()} not playable here` : "Source unavailable"}</p>
          <p className="max-w-[220px] truncate text-[12px] text-white/50">{item.title}</p>
          <div className="mt-1 flex gap-4 text-micro">
            <button onClick={() => onAssign(slot.index)} className="text-white/70 hover:text-white">Replace</button>
            <button onClick={() => clearSlot(slot.index)} className="text-white/40 hover:text-white">Clear</button>
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

      {/* Top: title + replace/clear (hover only) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-3 py-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <span className="truncate text-[12px] text-white/85"><span className="mr-2 font-mono text-[10px] text-white/35">P{slot.index + 1}</span>{item.title}</span>
        <div className="pointer-events-auto flex">
          <IconBtn onClick={() => onAssign(slot.index)} label="Replace"><RefreshCw size={12} /></IconBtn>
          <IconBtn onClick={() => clearSlot(slot.index)} label="Clear"><X size={13} /></IconBtn>
        </div>
      </div>

      {/* Bottom: seek + transport (hover only) */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-8 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={progress}
          aria-label="Seek"
          onChange={(e) => { const t = Number(e.target.value); setProgress(t); requestSeek(t, slot.index); }}
          className="mb-1.5 h-px w-full cursor-pointer appearance-none rounded-full [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
          style={{ background: `linear-gradient(90deg, rgba(255,255,255,0.9) ${pct}%, rgba(255,255,255,0.18) ${pct}%)` }}
        />
        <div className="flex items-center gap-1">
          <IconBtn onClick={() => setSlotPlaying(slot.index, !slot.playing)} label={slot.playing ? "Pause" : "Play"}>{slot.playing ? <Pause size={14} /> : <Play size={14} />}</IconBtn>
          <IconBtn onClick={() => setSlotMuted(slot.index, !slot.muted)} label={slot.muted ? "Unmute" : "Mute"}>{slot.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}</IconBtn>
          <input type="range" min={0} max={1} step={0.05} value={slot.volume} aria-label="Volume" onChange={(e) => setSlotVolume(slot.index, Number(e.target.value))} className="h-px w-12 cursor-pointer appearance-none rounded-full bg-white/25 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white" />
          <span className="ml-2 font-mono text-[10px] tabular text-white/50">{formatDuration(progress)} / {formatDuration(duration)}</span>
          <div className="ml-auto flex">
            <IconBtn onClick={() => { setFocusIndex(slot.index); setLayout("focus"); }} label="Focus"><Focus size={13} /></IconBtn>
            <IconBtn onClick={() => void videoRef.current?.requestFullscreen?.()} label="Fullscreen"><Maximize2 size={13} /></IconBtn>
          </div>
        </div>
      </div>

      {!slot.playing && !errored && (
        <button onClick={() => setSlotPlaying(slot.index, true)} className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100" aria-label="Play">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-black"><Play size={16} className="ml-0.5" fill="currentColor" /></span>
        </button>
      )}
    </motion.div>
  );
}

function IconBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="flex h-7 w-7 items-center justify-center rounded-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white">
      {children}
    </button>
  );
}
