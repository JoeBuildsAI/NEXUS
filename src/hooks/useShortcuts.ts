import { useEffect } from "react";
import { shortcutFor, type ShortcutAction } from "@/core/shortcuts";
import { validateSegment } from "@/core/loop";
import { native } from "@/core/native";
import { markersOf, usePlayer } from "@/state/player";
import { playback, useVideo } from "@/state/video";
import { prevNext } from "@/components/Controls";
import { toggleFullscreen } from "@/components/Player";
import { pickAndOpenVideo } from "@/components/EmptyState";

const RATE_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

function run(action: ShortcutAction) {
  const p = usePlayer.getState();
  const v = useVideo.getState();
  switch (action) {
    case "toggle-play": return playback.toggle();
    case "seek-back": return playback.seekBy(-5);
    case "seek-fwd": return playback.seekBy(5);
    case "seek-back-long": return playback.seekBy(-30);
    case "seek-fwd-long": return playback.seekBy(30);
    case "frame-back": return playback.frameStep(-1);
    case "frame-fwd": return playback.frameStep(1);
    case "set-a": return p.setMarker("a", playback.now());
    case "set-b": return p.setMarker("b", playback.now());
    case "toggle-loop": {
      const m = markersOf(p);
      if (validateSegment(m.a, m.b, v.duration || null).ok) p.setLoopAB(!p.loopAB);
      return;
    }
    case "clear-markers": return p.clearMarkers();
    case "jump-a": {
      const a = markersOf(p).a;
      if (a != null) playback.seekTo(a);
      return;
    }
    case "cycle-repeat": return p.cycleRepeat();
    case "next": return prevNext(1);
    case "prev": return prevNext(-1);
    case "fullscreen": return void toggleFullscreen();
    case "exit-fullscreen": if (v.fullscreen) void toggleFullscreen(); return;
    case "mute": return p.setMuted(!p.muted);
    case "vol-up": return p.setVolume((p.muted ? 0 : p.volume) + 0.05);
    case "vol-down": return p.setVolume(p.volume - 0.05);
    case "slower": return p.setRate(RATE_STEPS.filter((r) => r < p.rate).pop() ?? p.rate);
    case "faster": return p.setRate(RATE_STEPS.find((r) => r > p.rate) ?? p.rate);
    case "toggle-panel": return p.togglePanel();
    case "open": return void pickAndOpenVideo();
    case "new-window": return void native.newWindow();
  }
}

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" && (t as HTMLInputElement).type !== "range" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      const action = shortcutFor(e);
      if (!action) return;
      // Range inputs keep their own arrow keys.
      if (t?.tagName === "INPUT" && e.key.startsWith("Arrow")) return;
      e.preventDefault();
      run(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
