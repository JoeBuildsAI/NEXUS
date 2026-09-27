import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Crosshair, Focus, Maximize2, Pause, Play, RefreshCw, Repeat, Repeat1, Scan, Star, Volume2, VolumeX, X } from "lucide-react";
import type { FitMode, MediaItem, PlayerSlot } from "@/core/types";
import { useMediaStore } from "@/state/mediaStore";
import { useMediaLibraryStore } from "@/state/mediaLibraryStore";
import { resolveFit, type Tile } from "@/core/media/layout";
import { entryPosition, formatClock, nextLoopMode, segmentAction } from "@/core/media/loop";
import { getProviders } from "@/providers";
import { notify } from "@/state/toastStore";
import { Timeline } from "./Timeline";
import { LoopPresetsMenu } from "./LoopPresetsMenu";
import { cn } from "@/lib/utils";

export type PlayerFailure = "unsupported" | "decode" | "missing" | "disconnected" | null;

interface Props {
  slot: PlayerSlot;
  item: MediaItem;
  tile: Tile;
  isPrimary: boolean;
  isActive: boolean;
  fitDefault: FitMode;
  reducedMotion: boolean;
  onAssign: (index: number) => void;
  onActivate: (index: number) => void;
  /** Exposes the element so the wall can read playback positions (saved workspaces). */
  register: (index: number, el: HTMLVideoElement | null) => void;
  /** Library drag/drop onto this player (replace). */
  onDropItem?: (e: React.DragEvent) => void;
}

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
const FIT_LABEL: Record<FitMode, string> = { fit: "Fit", fill: "Fill", smart: "Smart fill" };
const FAILURE_COPY: Record<Exclude<PlayerFailure, null>, { title: string; body: string }> = {
  unsupported: { title: "Unsupported", body: "This container or codec cannot be decoded here. The file is untouched." },
  decode: { title: "Decode failed", body: "The file could not be decoded — it may be corrupted or truncated." },
  missing: { title: "File missing", body: "The file is no longer at its indexed location." },
  disconnected: { title: "Drive disconnected", body: "The authorized location is not reachable right now." },
};

/**
 * One player living directly on the black wall. High-frequency playback state
 * stays inside this component (refs + ~4 Hz local ticks); only structural
 * state (item, loop mode, A/B, volume) lives in the workspace store.
 */
export function PlayerTile({ slot, item, tile, isPrimary, isActive, fitDefault, reducedMotion, onAssign, onActivate, register, onDropItem }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { setSlotPlaying, setSlotMuted, setSlotVolume, setSlotFit, setSlotRate, setSlotLoop, setLoopPoint, clearSegment, clearSlot, setPrimary, setMode, setFocusIndex, requestSeek, rememberPosition } = useMediaStore();
  const seekRequest = useMediaStore((s) => s.seekRequest);
  const syncStartSeq = useMediaStore((s) => s.syncStartSeq);
  const rootExists = useMediaLibraryStore((s) => (item.rootId ? s.roots.find((r) => r.id === item.rootId)?.exists ?? true : true));
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState<number | null>(item.durationSeconds || null);
  const [buffered, setBuffered] = useState<[number, number][]>([]);
  const [aspect, setAspect] = useState<number | null>(null);
  const [failure, setFailure] = useState<PlayerFailure>(null);
  const [hover, setHover] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  // Chrome shows on hover, and briefly after the tile becomes active or its state changes; it recedes while playing.
  const [recent, setRecent] = useState(false);
  const recentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback(() => {
    setRecent(true);
    if (recentTimer.current) clearTimeout(recentTimer.current);
    recentTimer.current = setTimeout(() => setRecent(false), 2200);
  }, []);
  useEffect(() => { if (isActive) flash(); }, [isActive, slot.loop, slot.loopA, slot.loopB, slot.fit, slot.rate, slot.muted, slot.volume, flash]);
  useEffect(() => () => { if (recentTimer.current) clearTimeout(recentTimer.current); }, []);
  const lastSeq = useRef(0);
  const lastSyncSeq = useRef(0);
  const seekingRef = useRef(false);
  const lastTickRef = useRef(0);
  /** Some containers (MediaRecorder WebM) report Infinity until the end is probed once. */
  const probingRef = useRef(false);
  const segment = slot.loop === "ab" && slot.loopA != null && slot.loopB != null ? { a: slot.loopA, b: slot.loopB } : null;
  const segmentRef = useRef(segment);
  segmentRef.current = segment;

  // ---- element registration
  useEffect(() => {
    register(slot.index, videoRef.current);
    return () => register(slot.index, null);
  }, [slot.index, register]);

  // ---- failure derived from availability
  useEffect(() => {
    if (!rootExists) setFailure("disconnected");
    else if (item.available === false) setFailure("missing");
    else setFailure((f) => (f === "disconnected" || f === "missing" ? null : f));
  }, [rootExists, item.available, item.id]);

  // ---- play/pause/mute/volume/rate/loop mirrors
  useEffect(() => {
    const v = videoRef.current;
    if (!v || failure) return;
    if (slot.playing) void v.play().catch(() => setSlotPlaying(slot.index, false));
    else v.pause();
  }, [slot.playing, slot.index, failure, setSlotPlaying]);
  useEffect(() => { if (videoRef.current) videoRef.current.muted = slot.muted; }, [slot.muted]);
  useEffect(() => { if (videoRef.current) videoRef.current.volume = slot.volume; }, [slot.volume]);
  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = slot.rate; }, [slot.rate]);
  useEffect(() => { if (videoRef.current) videoRef.current.loop = slot.loop === "full"; }, [slot.loop]);

  // ---- entering A–B from outside the segment jumps to A
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !segment) return;
    const entry = entryPosition(v.currentTime, segment);
    if (entry !== v.currentTime) v.currentTime = entry;
  }, [segment?.a, segment?.b, slot.loop]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- broadcast seeks / sync start
  useEffect(() => {
    if (!seekRequest || seekRequest.seq === lastSeq.current) return;
    lastSeq.current = seekRequest.seq;
    if (seekRequest.only != null && seekRequest.only !== slot.index) return;
    seekTo(seekRequest.time);
  }, [seekRequest, slot.index]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (syncStartSeq === lastSyncSeq.current) return;
    lastSyncSeq.current = syncStartSeq;
    const v = videoRef.current;
    if (v) { v.currentTime = segmentRef.current?.a ?? 0; void v.play().catch(() => undefined); }
  }, [syncStartSeq]);

  // ---- precise segment loop: per decoded frame when available, else timeupdate
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const check = () => {
      const seg = segmentRef.current;
      if (seg && !seekingRef.current && !v.paused && segmentAction(v.currentTime, seg, 1 / 30) === "seek-a") {
        seekingRef.current = true;
        v.currentTime = seg.a;
      }
    };
    let handle = 0;
    const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number; cancelVideoFrameCallback?: (h: number) => void });
    const useFrames = typeof rvfc.requestVideoFrameCallback === "function";
    const onFrame = () => { check(); if (!v.paused) handle = rvfc.requestVideoFrameCallback!(onFrame); };
    const onPlay = () => { if (useFrames) handle = rvfc.requestVideoFrameCallback!(onFrame); };
    const onTime = () => {
      check();
      // ~4 Hz UI tick (timeupdate cadence); avoids per-frame React work.
      const now = performance.now();
      if (now - lastTickRef.current > 200) { lastTickRef.current = now; setCurrent(v.currentTime); }
    };
    const onSeeked = () => { seekingRef.current = false; setCurrent(v.currentTime); };
    const onEnded = () => {
      const seg = segmentRef.current;
      if (seg) { v.currentTime = seg.a; void v.play().catch(() => undefined); }
      else if (!v.loop) setSlotPlaying(slot.index, false);
    };
    const onProgress = () => {
      const r: [number, number][] = [];
      for (let i = 0; i < v.buffered.length; i++) r.push([v.buffered.start(i), v.buffered.end(i)]);
      setBuffered(r);
    };
    const onDuration = () => {
      if (!Number.isFinite(v.duration)) return;
      setDuration(v.duration);
      if (probingRef.current) {
        probingRef.current = false;
        v.currentTime = 0;
      }
    };
    v.addEventListener("play", onPlay);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("seeked", onSeeked);
    v.addEventListener("ended", onEnded);
    v.addEventListener("progress", onProgress);
    v.addEventListener("durationchange", onDuration);
    if (!v.paused) onPlay();
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("seeked", onSeeked);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("progress", onProgress);
      v.removeEventListener("durationchange", onDuration);
      if (useFrames && handle) rvfc.cancelVideoFrameCallback?.(handle);
    };
  }, [item.id, slot.index, setSlotPlaying]);

  // ---- remember position on unmount / item change (only when enabled)
  useEffect(() => {
    const v = videoRef.current;
    const id = item.id;
    return () => { if (v && v.currentTime > 1) rememberPosition(id, v.currentTime); };
  }, [item.id, rememberPosition]);

  const seekTo = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(t)) return;
    const max = v.duration && Number.isFinite(v.duration) ? v.duration : t;
    seekingRef.current = true;
    v.currentTime = Math.max(0, Math.min(t, max));
    setCurrent(v.currentTime);
  }, []);
  const nudge = (delta: number) => seekTo((videoRef.current?.currentTime ?? 0) + delta);

  const onLoaded = (v: HTMLVideoElement) => {
    if (Number.isFinite(v.duration)) setDuration(v.duration);
    else if (!probingRef.current) {
      // Probe the end once so the timeline, A–B and seeking have a real duration.
      probingRef.current = true;
      v.currentTime = 1e9;
    }
    if (v.videoWidth && v.videoHeight) setAspect(v.videoWidth / v.videoHeight);
    setFailure(null);
    const restore = useMediaStore.getState();
    if (restore.defaults.restorePosition && restore.lastPosition[item.id] && !segmentRef.current) v.currentTime = restore.lastPosition[item.id]!;
  };
  const onError = async () => {
    const code = videoRef.current?.error?.code;
    if (code === 4) return setFailure("unsupported");
    if (code === 3) return setFailure("decode");
    if (code === 1) return;
    // Network-class failure for a local file: is the file / drive still there?
    const provider = getProviders().media;
    const ok = provider.checkAvailable ? await provider.checkAvailable(item.id).catch(() => false) : false;
    setFailure(ok ? "decode" : rootExists ? "missing" : "disconnected");
  };
  const reload = () => {
    setFailure(null);
    const v = videoRef.current;
    if (v) { v.load(); if (slot.playing) void v.play().catch(() => undefined); }
  };

  const fitMode = slot.fit ?? fitDefault;
  const objectFit = useMemo(() => resolveFit(fitMode, tile.width / Math.max(1, tile.height), aspect), [fitMode, tile.width, tile.height, aspect]);
  const setPoint = (which: "a" | "b") => {
    const err = setLoopPoint(slot.index, which, videoRef.current?.currentTime ?? 0, duration);
    if (err && err !== "b-before-a") notify.warn("Segment not set", err === "too-short" ? "Segments need at least half a second." : "That point is outside the video.");
  };
  const cycleLoop = () => setSlotLoop(slot.index, nextLoopMode(slot.loop, slot.loopA != null && slot.loopB != null));
  const cycleFit = () => setSlotFit(slot.index, fitMode === "smart" ? "fit" : fitMode === "fit" ? "fill" : "smart");
  const chrome = hover || presetsOpen || recent || (isActive && !slot.playing);
  const compact = tile.width < 420;

  return (
    <div
      className={cn("group absolute overflow-hidden bg-black outline-none", !reducedMotion && "transition-[left,top,width,height] duration-300 ease-nexus")}
      style={{ left: tile.x, top: tile.y, width: tile.width, height: tile.height }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseDown={() => onActivate(slot.index)}
      onDoubleClick={(e) => { if ((e.target as HTMLElement).tagName === "VIDEO") setPrimary(isPrimary ? null : slot.index); }}
      data-player={slot.index}
      data-active={isActive || undefined}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("application/x-nexus-media")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
      onDrop={(e) => onDropItem?.(e)}
    >
      {failure ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center" style={{ background: `radial-gradient(80% 80% at 50% 50%, ${item.thumbnailColor}18, #000)` }}>
          <p className="text-micro tracking-cinematic text-status-attention/80">{FAILURE_COPY[failure].title}</p>
          <p className="max-w-[260px] truncate text-[13px] text-white/70">{item.title}</p>
          <p className="max-w-[300px] text-[12px] leading-relaxed text-white/40">{FAILURE_COPY[failure].body}</p>
          <div className="mt-2 flex gap-4 text-[12.5px]">
            <button onClick={reload} className="text-white/70 hover:text-white">Reload</button>
            <button onClick={() => onAssign(slot.index)} className="text-white/50 hover:text-white">Replace</button>
            <button onClick={() => clearSlot(slot.index)} className="text-white/40 hover:text-white">Remove</button>
          </div>
        </div>
      ) : (
        <video
          ref={videoRef}
          src={item.src}
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => onLoaded(e.currentTarget)}
          onError={() => void onError()}
          className="h-full w-full"
          style={{ objectFit, background: "#000" }}
        />
      )}

      {/* Selection — platinum hairline, no card */}
      <div className={cn("pointer-events-none absolute inset-0 transition-[box-shadow] duration-200", isActive ? "shadow-[inset_0_0_0_1px_rgba(207,214,221,0.55)]" : isPrimary ? "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]" : "")} />

      {/* Top chrome */}
      <div className={cn("pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/75 to-transparent px-3 py-2 transition-opacity duration-200", chrome ? "opacity-100" : "opacity-0")}>
        <span className="flex min-w-0 items-center gap-2 text-[12px] text-white/85">
          <span className="font-mono text-[10px] text-white/35">P{slot.index + 1}</span>
          {isPrimary && <Star size={10} className="shrink-0 fill-white text-white" />}
          <span className="truncate">{item.title}</span>
        </span>
        <div className="pointer-events-auto flex shrink-0">
          <IconBtn onClick={() => setPrimary(isPrimary ? null : slot.index)} label={isPrimary ? "Remove primary" : "Make primary"} active={isPrimary}><Star size={12} /></IconBtn>
          <IconBtn onClick={() => { setFocusIndex(slot.index); setMode("focus"); }} label="Focus"><Focus size={12} /></IconBtn>
          <IconBtn onClick={() => void videoRef.current?.requestFullscreen?.()} label="Fullscreen"><Maximize2 size={12} /></IconBtn>
          <IconBtn onClick={() => onAssign(slot.index)} label="Replace"><RefreshCw size={12} /></IconBtn>
          <IconBtn onClick={() => clearSlot(slot.index)} label="Remove"><X size={13} /></IconBtn>
        </div>
      </div>

      {/* Bottom chrome */}
      {!failure && (
        <div className={cn("absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pb-2 pt-10 transition-opacity duration-200", chrome ? "opacity-100" : "opacity-0")}>
          <Timeline current={current} duration={duration} buffered={buffered} segment={segment} pendingA={slot.loop !== "ab" ? slot.loopA : null} pendingB={slot.loop !== "ab" ? slot.loopB : null} onSeek={seekTo} onSeekBroadcast={(t) => requestSeek(t, slot.index)} compact={compact} />
          <div className="mt-1.5 flex items-center gap-0.5">
            <IconBtn onClick={() => setSlotPlaying(slot.index, !slot.playing)} label={slot.playing ? "Pause" : "Play"}>{slot.playing ? <Pause size={14} /> : <Play size={14} />}</IconBtn>
            {!compact && <TextBtn onClick={() => nudge(-10)} label="Back 10 seconds">−10</TextBtn>}
            {!compact && <TextBtn onClick={() => nudge(10)} label="Forward 10 seconds">+10</TextBtn>}
            <IconBtn onClick={() => setSlotMuted(slot.index, !slot.muted)} label={slot.muted ? "Unmute" : "Mute"}>{slot.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}</IconBtn>
            {!compact && <input type="range" min={0} max={1} step={0.05} value={slot.volume} aria-label="Volume" onChange={(e) => setSlotVolume(slot.index, Number(e.target.value))} className="h-px w-14 cursor-pointer appearance-none rounded-full bg-white/25 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white" />}
            <span className="ml-2 font-mono text-[10.5px] tabular text-white/55">{formatClock(current)}<span className="text-white/30"> / {duration != null ? formatClock(duration) : "––:––"}</span></span>

            <div className="ml-auto flex items-center gap-0.5">
              {/* Loop cluster */}
              <IconBtn onClick={cycleLoop} label={`Loop: ${slot.loop === "off" ? "off" : slot.loop === "full" ? "full video" : "A–B segment"}`} active={slot.loop !== "off"}>
                {slot.loop === "ab" ? <Repeat1 size={13} /> : <Repeat size={13} />}
              </IconBtn>
              <TextBtn onClick={() => setPoint("a")} label="Set loop in (I)" active={slot.loopA != null}>A</TextBtn>
              <TextBtn onClick={() => setPoint("b")} label="Set loop out (O)" active={slot.loopB != null}>B</TextBtn>
              {(slot.loopA != null || slot.loopB != null) && <IconBtn onClick={() => clearSegment(slot.index)} label="Clear segment"><Crosshair size={12} /></IconBtn>}
              <IconBtn onClick={() => setPresetsOpen((v) => !v)} label="Loop presets" active={presetsOpen}><Bookmark size={12} /></IconBtn>
              <span className="mx-1 h-3 w-px bg-white/15" />
              <IconBtn onClick={cycleFit} label={`Fit: ${FIT_LABEL[fitMode]}${slot.fit == null ? " (default)" : ""}`}><Scan size={13} /></IconBtn>
              {!compact && (
                <button onClick={() => setSlotRate(slot.index, RATES[(RATES.indexOf(slot.rate) + 1) % RATES.length]!)} className="h-7 rounded-sm px-1.5 font-mono text-[10.5px] tabular text-white/60 transition-colors hover:bg-white/10 hover:text-white" aria-label="Playback speed">
                  {slot.rate}×
                </button>
              )}
            </div>
          </div>
          {segment && !compact && (
            <p className="mt-1 font-mono text-[10px] tabular text-white/45">
              <span className="text-white/70">A</span> {formatClock(segment.a)} <span className="mx-1 text-white/25">→</span> <span className="text-white/70">B</span> {formatClock(segment.b)} <span className="mx-1 text-white/25">·</span> loop {formatClock(segment.b - segment.a)}
            </p>
          )}
        </div>
      )}

      {presetsOpen && <LoopPresetsMenu slot={slot} item={item} duration={duration} onClose={() => setPresetsOpen(false)} />}

      {!slot.playing && !failure && (
        <button onClick={() => setSlotPlaying(slot.index, true)} className={cn("absolute inset-0 flex items-center justify-center transition-opacity duration-200", chrome ? "opacity-100" : "opacity-0")} aria-label="Play">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-black"><Play size={17} className="ml-0.5" fill="currentColor" /></span>
        </button>
      )}
    </div>
  );
}

export function IconBtn({ children, onClick, label, active }: { children: React.ReactNode; onClick: () => void; label: string; active?: boolean }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className={cn("flex h-7 w-7 items-center justify-center rounded-sm transition-colors hover:bg-white/10 hover:text-white", active ? "text-white" : "text-white/60")}>
      {children}
    </button>
  );
}

function TextBtn({ children, onClick, label, active }: { children: React.ReactNode; onClick: () => void; label: string; active?: boolean }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className={cn("h-7 rounded-sm px-1.5 font-mono text-[10.5px] tabular transition-colors hover:bg-white/10 hover:text-white", active ? "text-white" : "text-white/55")}>
      {children}
    </button>
  );
}
