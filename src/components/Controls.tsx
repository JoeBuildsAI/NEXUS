import { Maximize, Minimize, Pause, Play, PanelRight, Repeat, Repeat1, SkipBack, SkipForward, Volume2, VolumeX, X } from "lucide-react";
import { formatClock, validateSegment } from "@/core/loop";
import { neighbor } from "@/core/playlist";
import { markersOf, usePlayer } from "@/state/player";
import { playback, useVideo } from "@/state/video";
import { cn, qualityLabel } from "@/lib/format";
import { Timeline } from "./Timeline";
import { toggleFullscreen } from "./Player";

const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

export function Controls() {
  const playing = useVideo((s) => s.playing);
  const time = useVideo((s) => s.time);
  const duration = useVideo((s) => s.duration);
  const width = useVideo((s) => s.width);
  const height = useVideo((s) => s.height);
  const fullscreen = useVideo((s) => s.fullscreen);
  const p = usePlayer();
  const markers = usePlayer(markersOf);
  const valid = validateSegment(markers.a, markers.b, duration || null);

  return (
    <div className="bg-gradient-to-t from-black/90 via-black/60 to-transparent px-5 pb-3 pt-14">
      <Timeline />
      <div className="mt-1 flex items-center gap-1 text-white/80">
        <Btn label="Previous video (P)" onClick={() => prevNext(-1)}><SkipBack size={17} /></Btn>
        <Btn label={playing ? "Pause (Space)" : "Play (Space)"} onClick={() => playback.toggle()} big>
          {playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="translate-x-px" />}
        </Btn>
        <Btn label="Next video (N)" onClick={() => prevNext(1)}><SkipForward size={17} /></Btn>

        <span className="ml-2 font-mono text-[12px] tabular text-white/75">
          {formatClock(time)} <span className="text-white/35">/ {formatClock(duration)}</span>
        </span>

        <div className="ml-4 flex items-center gap-1 border-l border-white/10 pl-4">
          <Pill label="Set loop start A at the playhead (I)" onClick={() => p.setMarker("a", playback.now())} on={markers.a != null}>
            A{markers.a != null && <span className="ml-1 font-mono text-[10px] text-white/50">{formatClock(markers.a)}</span>}
          </Pill>
          <Pill label="Set loop end B at the playhead (O)" onClick={() => p.setMarker("b", playback.now())} on={markers.b != null}>
            B{markers.b != null && <span className="ml-1 font-mono text-[10px] text-white/50">{formatClock(markers.b)}</span>}
          </Pill>
          <Pill
            label={valid.ok ? "Loop between A and B (L)" : "Set A and B first (at least half a second apart)"}
            onClick={() => valid.ok && p.setLoopAB(!p.loopAB)}
            on={p.loopAB && valid.ok}
            accent
            disabled={!valid.ok}
          >
            Loop A–B
          </Pill>
          {(markers.a != null || markers.b != null) && (
            <Btn label="Clear markers (X)" onClick={p.clearMarkers}><X size={14} /></Btn>
          )}
        </div>

        <div className="flex-1" />

        {width > 0 && <span className="mr-2 hidden font-mono text-[11px] text-white/40 md:inline" title={`${width}×${height}`}>{qualityLabel(width, height)} · {width}×{height}</span>}

        <Btn label={`Repeat: ${p.repeat === "off" ? "off" : p.repeat === "one" ? "this video" : "whole folder"} (R)`} onClick={p.cycleRepeat} on={p.repeat !== "off"}>
          {p.repeat === "one" ? <Repeat1 size={17} /> : <Repeat size={17} />}
        </Btn>

        <select
          aria-label="Playback speed"
          value={p.rate}
          onChange={(e) => p.setRate(Number(e.target.value))}
          className="h-8 cursor-pointer rounded bg-transparent px-1 font-mono text-[12px] text-white/75 outline-none hover:bg-white/[0.08]"
        >
          {RATES.map((r) => <option key={r} value={r} className="bg-neutral-900">{r}×</option>)}
        </select>

        <Btn label={p.muted ? "Unmute (M)" : "Mute (M)"} onClick={() => p.setMuted(!p.muted)}>
          {p.muted || p.volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
        </Btn>
        <input
          aria-label="Volume"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={p.muted ? 0 : p.volume}
          onChange={(e) => p.setVolume(Number(e.target.value))}
          className="h-1 w-20 cursor-pointer accent-white"
        />

        {!fullscreen && <Btn label="Folder (B)" onClick={p.togglePanel} on={p.panelOpen}><PanelRight size={17} /></Btn>}
        <Btn label={fullscreen ? "Exit full screen (F / Esc)" : "Full screen (F)"} onClick={() => void toggleFullscreen()}>
          {fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
        </Btn>
      </div>
    </div>
  );
}

export function prevNext(dir: 1 | -1) {
  const { listing, current, repeat, select } = usePlayer.getState();
  const next = neighbor(listing?.videos ?? [], current, dir, repeat === "all");
  if (next) select(next);
}

function Btn({ children, label, onClick, on, big }: { children: React.ReactNode; label: string; onClick: () => void; on?: boolean; big?: boolean }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn("flex items-center justify-center rounded transition-colors hover:bg-white/[0.08] hover:text-white", big ? "h-10 w-10" : "h-8 w-8", on && "text-sky-300 hover:text-sky-200")}
    >
      {children}
    </button>
  );
}

function Pill({ children, label, onClick, on, accent, disabled }: { children: React.ReactNode; label: string; onClick: () => void; on?: boolean; accent?: boolean; disabled?: boolean }) {
  return (
    <button
      aria-label={label}
      aria-pressed={on}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-7 items-center rounded px-2.5 text-[12px] font-medium transition-colors",
        disabled ? "cursor-not-allowed text-white/25" : "text-white/75 hover:bg-white/[0.08] hover:text-white",
        on && (accent ? "bg-sky-400/90 text-black hover:bg-sky-300 hover:text-black" : "bg-white/[0.1] text-white"),
      )}
    >
      {children}
    </button>
  );
}
