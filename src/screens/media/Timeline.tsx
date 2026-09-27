import { useRef, useState } from "react";
import { formatClock } from "@/core/media/loop";
import { cn } from "@/lib/utils";

interface Props {
  current: number;
  duration: number | null;
  buffered: readonly [number, number][];
  segment: { a: number; b: number } | null;
  /** A or B set while not yet looping (single markers). */
  pendingA: number | null;
  pendingB: number | null;
  onSeek: (t: number) => void;
  /** Optional broadcast (sync playback). */
  onSeekBroadcast?: (t: number) => void;
  compact?: boolean;
}

/**
 * Player timeline: buffered range, played range, playhead, A–B range (outside
 * recedes), hover timestamp, click + drag seek. Sized for hover use at 1080p
 * and still legible at 4K; markers scale with the tile.
 */
export function Timeline({ current, duration, buffered, segment, pendingA, pendingB, onSeek, onSeekBroadcast, compact }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const d = duration && Number.isFinite(duration) && duration > 0 ? duration : null;
  const pct = (t: number) => (d ? Math.max(0, Math.min(100, (t / d) * 100)) : 0);

  const timeAt = (clientX: number): number | null => {
    const el = ref.current;
    if (!el || !d) return null;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(d, ((clientX - r.left) / r.width) * d));
  };
  const commit = (clientX: number) => {
    const t = timeAt(clientX);
    if (t == null) return;
    onSeek(t);
    onSeekBroadcast?.(t);
  };

  return (
    <div className="relative select-none" onMouseLeave={() => { if (!dragging) setHoverT(null); }}>
      {hoverT != null && d && (
        <span className="pointer-events-none absolute -top-5 -translate-x-1/2 font-mono text-[10px] tabular text-white/80" style={{ left: `${pct(hoverT)}%` }}>{formatClock(hoverT)}</span>
      )}
      <div
        ref={ref}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={d ?? 0}
        aria-valuenow={Math.round(current)}
        tabIndex={-1}
        className={cn("relative w-full cursor-pointer", compact ? "h-4" : "h-5")}
        onMouseMove={(e) => { const t = timeAt(e.clientX); setHoverT(t); if (dragging && t != null) onSeek(t); }}
        onMouseDown={(e) => { e.preventDefault(); setDragging(true); commit(e.clientX); }}
        onMouseUp={(e) => { setDragging(false); commit(e.clientX); }}
      >
        {/* Track */}
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/15" />
        {/* Buffered */}
        {d && buffered.map(([s, e], i) => <div key={i} className="absolute top-1/2 h-px -translate-y-1/2 bg-white/28" style={{ left: `${pct(s)}%`, width: `${pct(e) - pct(s)}%` }} />)}
        {/* A–B: outside the segment recedes, inside is lifted */}
        {d && segment && (
          <>
            <div className="absolute inset-y-0 left-0 bg-black/45" style={{ width: `${pct(segment.a)}%` }} />
            <div className="absolute inset-y-0 right-0 bg-black/45" style={{ width: `${100 - pct(segment.b)}%` }} />
            <div className="absolute top-1/2 h-[3px] -translate-y-1/2 bg-white/35" style={{ left: `${pct(segment.a)}%`, width: `${pct(segment.b) - pct(segment.a)}%` }} />
          </>
        )}
        {/* Played (within the whole file) */}
        {d && <div className="absolute top-1/2 h-px -translate-y-1/2 bg-white/90" style={{ width: `${pct(current)}%` }} />}
        {/* Markers */}
        {d && (segment ? [segment.a, segment.b] : [pendingA, pendingB]).map((t, i) =>
          t == null ? null : (
            <div key={i} className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: `${pct(t)}%` }}>
              <span className={cn("block w-px bg-white", compact ? "h-2.5" : "h-3.5")} />
              {!compact && <span className="absolute -bottom-3 font-mono text-[9px] text-white/70">{i === 0 ? "A" : "B"}</span>}
            </div>
          ),
        )}
        {/* Playhead */}
        {d && <div className={cn("absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white", compact ? "h-2 w-2" : "h-2.5 w-2.5")} style={{ left: `${pct(current)}%` }} />}
      </div>
    </div>
  );
}
