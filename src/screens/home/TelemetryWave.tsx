import { useEffect, useRef } from "react";
import { useTelemetryStore } from "@/state/telemetryStore";
import { useSettingsStore } from "@/state/settingsStore";
import { useModeStore } from "@/state/modeStore";

/**
 * Ambient telemetry: CPU / memory / GPU history as thin white lines with a
 * slow scan line. Canvas; rAF only while visible and not in a game session;
 * static render under reduced motion.
 */
export function TelemetryWave({ height = 120 }: { height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const history = useTelemetryStore((s) => s.history);
  const reduced = useSettingsStore((s) => s.appearance.reducedMotion || !s.appearance.telemetryAnimation);
  const gameRunning = useModeStore((s) => s.gameRunning);
  const still = reduced || gameRunning;
  const histRef = useRef(history);
  histRef.current = history;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let t = 0;

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const hist = histRef.current;
      const series = [
        { data: hist.map((x) => x.cpu.usagePercent), alpha: 0.85, width: 1.25 },
        { data: hist.map((x) => x.memory.usagePercent), alpha: 0.35, width: 1 },
        { data: hist.map((x) => x.gpu?.usagePercent ?? 0), alpha: 0.2, width: 1 },
      ];

      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      for (const y of [0.5]) {
        ctx.beginPath();
        ctx.moveTo(0, h * y);
        ctx.lineTo(w, h * y);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.beginPath();
      ctx.moveTo(0, h - 0.5);
      ctx.lineTo(w, h - 0.5);
      ctx.stroke();

      const N = 60;
      for (const s of series) {
        if (s.data.length < 2) continue;
        const pts = s.data.slice(-N);
        // Spread whatever history exists across the full width; the line
        // densifies as the buffer fills rather than creeping in from the right.
        const step = w / (pts.length - 1);
        const offset = 0;
        ctx.beginPath();
        pts.forEach((v, i) => {
          const x = (i + offset) * step;
          const y = h - (Math.min(100, v) / 100) * (h * 0.82) - h * 0.04;
          if (i === 0) ctx.moveTo(x, y);
          else {
            const px = (i - 1 + offset) * step;
            const pv = pts[i - 1]!;
            const py = h - (Math.min(100, pv) / 100) * (h * 0.82) - h * 0.04;
            const cx = (px + x) / 2;
            ctx.bezierCurveTo(cx, py, cx, y, x, y);
          }
        });
        ctx.strokeStyle = `rgba(255,255,255,${s.alpha})`;
        ctx.lineWidth = s.width;
        ctx.stroke();
      }

      if (!still) {
        const x = ((t % 1400) / 1400) * w;
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "rgba(255,255,255,0)");
        g.addColorStop(0.5, "rgba(255,255,255,0.09)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x, 0, 1, h);
        t += 1;
        raf = requestAnimationFrame(draw);
      }
    };

    draw();
    const onVis = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else draw();
    };
    document.addEventListener("visibilitychange", onVis);
    const ro = new ResizeObserver(() => still && draw());
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      ro.disconnect();
    };
  }, [still]);

  // Static re-render on new samples when not animating.
  useEffect(() => {
    if (!still) return;
    ref.current?.dispatchEvent(new Event("resize"));
  }, [history.length, still]);

  return (
    <div className="relative w-full" style={{ height }}>
      <canvas ref={ref} className="h-full w-full" />
      <div className="pointer-events-none absolute left-0 top-0 flex gap-4 text-micro">
        <span className="text-white/60">CPU</span>
        <span className="text-white/35">Memory</span>
        <span className="text-white/25">GPU</span>
      </div>
    </div>
  );
}
