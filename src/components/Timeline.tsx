import { useRef, useState } from "react";
import { formatClock } from "@/core/loop";
import { markersOf, usePlayer } from "@/state/player";
import { playback, useVideo } from "@/state/video";
import { cn } from "@/lib/format";

/**
 * Scrubber with buffered range, A–B region and draggable A/B handles.
 * Click/drag to seek; drag a handle to move that marker.
 */
export function Timeline() {
  const time = useVideo((s) => s.time);
  const duration = useVideo((s) => s.duration);
  const buffered = useVideo((s) => s.buffered);
  const markers = usePlayer(markersOf);
  const loopAB = usePlayer((s) => s.loopAB);
  const setMarker = usePlayer((s) => s.setMarker);
  const track = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<"seek" | "a" | "b" | null>(null);

  const pct = (t: number | null) => (duration > 0 && t != null ? `${Math.min(100, Math.max(0, (t / duration) * 100))}%` : "0%");
  const timeAt = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    if (!r || duration <= 0) return 0;
    return Math.min(duration, Math.max(0, ((clientX - r.left) / r.width) * duration));
  };
  const apply = (mode: "seek" | "a" | "b", clientX: number) => {
    const t = timeAt(clientX);
    if (mode === "seek") playback.seekTo(t);
    else setMarker(mode, t);
  };
  const begin = (mode: "seek" | "a" | "b") => (e: React.PointerEvent) => {
    e.stopPropagation();
    // Capture on the track so moves keep arriving there while a handle is dragged.
    track.current?.setPointerCapture(e.pointerId);
    setDrag(mode);
    apply(mode, e.clientX);
  };

  const hasA = markers.a != null;
  const hasB = markers.b != null;

  return (
    <div className="group/tl relative select-none px-1 py-2">
      <div
        ref={track}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(time)}
        aria-valuetext={formatClock(time)}
        tabIndex={-1}
        className="relative h-1.5 cursor-pointer rounded-full bg-white/[0.14] transition-[height] duration-150 group-hover/tl:h-2"
        onPointerDown={begin("seek")}
        onPointerMove={(e) => { setHover(timeAt(e.clientX)); if (drag) apply(drag, e.clientX); }}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setHover(null)}
      >
        {buffered.map(([s, e], i) => (
          <div key={i} className="absolute inset-y-0 rounded-full bg-white/[0.18]" style={{ left: pct(s), width: `calc(${pct(e)} - ${pct(s)})` }} />
        ))}
        {hasA && hasB && markers.b! > markers.a! && (
          <div className={cn("absolute inset-y-[-3px] rounded-sm", loopAB ? "bg-sky-400/35" : "bg-white/15")} style={{ left: pct(markers.a), width: `calc(${pct(markers.b)} - ${pct(markers.a)})` }} />
        )}
        <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: pct(time) }} />
        <div className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow opacity-0 transition-opacity group-hover/tl:opacity-100" style={{ left: pct(time) }} />

        {hasA && <Handle label="A" at={pct(markers.a)} active={loopAB} onPointerDown={begin("a")} />}
        {hasB && <Handle label="B" at={pct(markers.b)} active={loopAB} onPointerDown={begin("b")} />}

        {hover != null && (
          <div className="pointer-events-none absolute -top-8 -translate-x-1/2 rounded-sm bg-black/85 px-1.5 py-0.5 font-mono text-[11px] tabular text-white/85" style={{ left: pct(hover) }}>
            {formatClock(hover)}
          </div>
        )}
      </div>
    </div>
  );
}

function Handle({ label, at, active, onPointerDown }: { label: string; at: string; active: boolean; onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <button
      aria-label={`Marker ${label} (drag to move)`}
      onPointerDown={onPointerDown}
      className={cn(
        "absolute -top-5 flex h-4 w-4 -translate-x-1/2 cursor-ew-resize items-center justify-center rounded-[3px] font-mono text-[9px] font-semibold",
        active ? "bg-sky-400 text-black" : "bg-white/85 text-black",
      )}
      style={{ left: at }}
    >
      {label}
      <span className={cn("absolute top-4 h-5 w-px", active ? "bg-sky-400" : "bg-white/70")} />
    </button>
  );
}
