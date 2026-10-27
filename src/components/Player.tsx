import { useCallback, useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { native } from "@/core/native";
import { entryPosition, segmentAction, validateSegment } from "@/core/loop";
import { onEnded } from "@/core/playlist";
import { markersOf, usePlayer } from "@/state/player";
import { playback, useVideo } from "@/state/video";
import { Controls } from "./Controls";
import { cn } from "@/lib/format";

type FrameVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

/**
 * The stage: one video at its original resolution (no transcoding, no scaling
 * filters), letterboxed on pure black, with A–B looping driven per decoded
 * frame and auto-hiding controls.
 */
export function Player() {
  const current = usePlayer((s) => s.current);
  const listing = usePlayer((s) => s.listing);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const rate = usePlayer((s) => s.rate);
  const loopAB = usePlayer((s) => s.loopAB);
  const repeat = usePlayer((s) => s.repeat);
  const markers = usePlayer(markersOf);
  const duration = useVideo((s) => s.duration);
  const [src, setSrc] = useState<string | null>(null);
  const ref = useRef<FrameVideo | null>(null);
  const setVideo = useVideo((s) => s.set);
  const playing = useVideo((s) => s.playing);
  const failed = useVideo((s) => s.failed);
  const [chrome, setChrome] = useState(true);
  const hideTimer = useRef<number>();

  useEffect(() => {
    let cancelled = false;
    setVideo({ failed: false, time: 0, duration: 0, buffered: [], width: 0, height: 0 });
    if (!current) return setSrc(null);
    void native.assetUrl(current).then((u) => { if (!cancelled) setSrc(u); });
    return () => { cancelled = true; };
  }, [current, setVideo]);

  const attach = useCallback((node: FrameVideo | null) => {
    ref.current = node;
    setVideo({ el: node });
  }, [setVideo]);

  // Preferences → element.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted;
    v.playbackRate = rate;
  }, [volume, muted, rate, src]);

  // A–B loop: checked on every decoded frame (precise, not frame-perfect: seeks land on decodable positions).
  const segment = loopAB ? validateSegment(markers.a, markers.b, duration || null) : null;
  const seg = segment && segment.ok ? segment.segment : null;
  useEffect(() => {
    const v = ref.current;
    if (!v || !seg) return;
    if (v.currentTime < seg.a || v.currentTime >= seg.b) v.currentTime = entryPosition(v.currentTime, seg);
    let id = 0;
    const onFrame = (_now: number, meta: { mediaTime: number }) => {
      if (segmentAction(meta.mediaTime, seg) === "seek-a") v.currentTime = seg.a;
      id = v.requestVideoFrameCallback!(onFrame);
    };
    const onTime = () => { if (segmentAction(v.currentTime, seg, 0.25) === "seek-a") v.currentTime = seg.a; };
    if (v.requestVideoFrameCallback) id = v.requestVideoFrameCallback(onFrame);
    v.addEventListener("timeupdate", onTime);
    return () => {
      if (id && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(id);
      v.removeEventListener("timeupdate", onTime);
    };
  }, [seg?.a, seg?.b, src]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEnded = () => {
    const v = ref.current;
    if (!v) return;
    if (seg) { v.currentTime = seg.a; void v.play(); return; }
    const action = onEnded(repeat, listing?.videos ?? [], current);
    if (action.kind === "replay") { v.currentTime = 0; void v.play(); }
    else if (action.kind === "play") usePlayer.getState().select(action.path);
  };

  const readBuffered = (v: HTMLVideoElement): [number, number][] => {
    const out: [number, number][] = [];
    for (let i = 0; i < v.buffered.length; i++) out.push([v.buffered.start(i), v.buffered.end(i)]);
    return out;
  };

  // Controls fade out while playing; any pointer movement brings them back.
  const reveal = useCallback(() => {
    setChrome(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setChrome(false), 2600);
  }, []);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);
  const showChrome = chrome || !playing || failed;

  return (
    <div className={cn("relative h-full w-full overflow-hidden bg-black", !showChrome && "cursor-none")} onMouseMove={reveal} onMouseLeave={() => playing && setChrome(false)}>
      {src && (
        <video
          key={src}
          ref={attach}
          src={src}
          autoPlay
          preload="auto"
          playsInline
          disablePictureInPicture
          className="absolute inset-0 h-full w-full bg-black object-contain"
          onClick={() => playback.toggle()}
          onDoubleClick={() => void toggleFullscreen()}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            setVideo({ duration: v.duration || 0, width: v.videoWidth, height: v.videoHeight, failed: false });
            v.volume = volume; v.muted = muted; v.playbackRate = rate;
          }}
          onTimeUpdate={(e) => setVideo({ time: e.currentTarget.currentTime })}
          onProgress={(e) => setVideo({ buffered: readBuffered(e.currentTarget) })}
          onPlay={() => { setVideo({ playing: true }); reveal(); }}
          onPause={() => setVideo({ playing: false })}
          onEnded={handleEnded}
          onError={() => setVideo({ failed: true, playing: false })}
        />
      )}

      {failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
          <p className="text-[15px] text-white/80">This video can't be decoded here.</p>
          <p className="max-w-md text-[13px] text-white/40">The file may use a codec Windows/WebView2 doesn't provide (common for some MKV/AVI files). Pick another video from the folder.</p>
        </div>
      )}

      {src && !playing && !failed && (
        <button onClick={() => playback.toggle()} aria-label="Play" className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white/90 backdrop-blur-sm transition hover:bg-black/60 hover:text-white">
          <Play size={30} fill="currentColor" className="translate-x-0.5" />
        </button>
      )}

      <div className={cn("absolute inset-x-0 bottom-0 transition-opacity duration-300", showChrome ? "opacity-100" : "pointer-events-none opacity-0")} onMouseEnter={() => { setChrome(true); window.clearTimeout(hideTimer.current); }}>
        <Controls />
      </div>
    </div>
  );
}

export async function toggleFullscreen() {
  try {
    const w = await native.window();
    const next = !(await w.isFullscreen());
    await w.setFullscreen(next);
    useVideo.getState().set({ fullscreen: next });
  } catch {
    // browser preview
  }
}
