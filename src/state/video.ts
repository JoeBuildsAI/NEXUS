import { create } from "zustand";

/**
 * Live playback state mirrored from the single <video> element, plus the
 * imperative handle used by controls and keyboard shortcuts.
 */
interface VideoState {
  el: HTMLVideoElement | null;
  time: number;
  duration: number;
  playing: boolean;
  buffered: [number, number][];
  width: number;
  height: number;
  failed: boolean;
  fullscreen: boolean;
  set: (patch: Partial<Omit<VideoState, "set">>) => void;
}

export const useVideo = create<VideoState>((set) => ({
  el: null,
  time: 0,
  duration: 0,
  playing: false,
  buffered: [],
  width: 0,
  height: 0,
  failed: false,
  fullscreen: false,
  set: (patch) => set(patch),
}));

const el = () => useVideo.getState().el;
const clampTime = (t: number) => {
  const v = el();
  const d = v && Number.isFinite(v.duration) ? v.duration : Infinity;
  return Math.min(Math.max(0, t), d);
};

export const playback = {
  toggle() {
    const v = el();
    if (!v) return;
    if (v.paused || v.ended) void v.play().catch(() => undefined);
    else v.pause();
  },
  play() {
    void el()?.play().catch(() => undefined);
  },
  seekTo(t: number) {
    const v = el();
    if (v) v.currentTime = clampTime(t);
  },
  seekBy(delta: number) {
    const v = el();
    if (v) v.currentTime = clampTime(v.currentTime + delta);
  },
  /** One frame (approximate: browsers don't expose the frame rate) — pauses first. */
  frameStep(dir: 1 | -1) {
    const v = el();
    if (!v) return;
    v.pause();
    v.currentTime = clampTime(v.currentTime + dir / 30);
  },
  now(): number {
    return el()?.currentTime ?? 0;
  },
};
