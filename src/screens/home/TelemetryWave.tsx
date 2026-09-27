import { useEffect, useRef } from "react";
import { useTelemetryStore } from "@/state/telemetryStore";
import { useSettingsStore } from "@/state/settingsStore";

/**
 * Wide, ambient real-time telemetry visualization: CPU and memory history drawn
 * as soft layered waves with a moving scan cursor. Canvas, rAF-only while
 * visible, respects reduced motion (static render).
 */
export function TelemetryWave({ height = 110 }: { height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const history = useTelemetryStore((s) => s.history);
  const reduced = useSettingsStore((s) => s.appearance.reducedMotion || !s.appearance.telemetryAnimation);
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
        { data: hist.map((x) => x.cpu.usagePercent), color: "94,208,230", alpha: 0.9 },
        { data: hist.map((x) => x.memory.usagePercent), color: "94,230,161", alpha: 0.55 },
        { data: hist.map((x) => x.gpu?.usagePercent ?? 0), color: "159,140,255", alpha: 0.45 },
      ];

      // Baseline grid
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      for (const y of [0.25, 0.5, 0.75]) {
        ctx.beginPath();
        ctx.moveTo(0, h * y);
        ctx.lineTo(w, h * y);
        ctx.stroke();
      }

      const N = 60;
      for (const s of series) {
        if (s.data.length < 2) continue;
        const pts = s.data.slice(-N);
        const step = w / (N - 1);
        const offset = N - pts.length;
        ctx.beginPath();
        pts.forEach((v, i) => {
          const x = (i + offset) * step;
          const y = h - (Math.min(100, v) / 100) * (h * 0.85) - h * 0.05;
          if (i === 0) ctx.moveTo(x, y);
          else {
            const px = (i - 1 + offset) * step;
            const pv = pts[i - 1]!;
            const py = h - (Math.min(100, pv) / 100) * (h * 0.85) - h * 0.05;
            const cx = (px + x) / 2;
            ctx.bezierCurveTo(cx, py, cx, y, x, y);
          }
        });
        ctx.strokeStyle = `rgba(${s.color},${s.alpha})`;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = `rgba(${s.color},0.6)`;
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Fill
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, `rgba(${s.color},${0.18 * s.alpha})`);
        grad.addColorStop(1, `rgba(${s.color},0)`);
        ctx.lineTo(w, h);
        ctx.lineTo(offset * step, h);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Scan cursor
      if (!reduced) {
        const x = (t % 600) / 600 * w;
        const g = ctx.createLinearGradient(x - 60, 0, x, 0);
        g.addColorStop(0, "rgba(94,208,230,0)");
        g.addColorStop(1, "rgba(94,208,230,0.12)");
        ctx.fillStyle = g;
        ctx.fillRect(x - 60, 0, 60, h);
        ctx.fillStyle = "rgba(94,208,230,0.5)";
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
    const ro = new ResizeObserver(() => { if (reduced) draw(); });
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      ro.disconnect();
    };
  }, [reduced]);

  // Re-render statically on new data when reduced.
  useEffect(() => {
    if (!reduced) return;
    const c = ref.current;
    if (c) c.dispatchEvent(new Event("resize"));
  }, [history.length, reduced]);

  return (
    <div className="relative w-full" style={{ height }}>
      <canvas ref={ref} className="h-full w-full" />
      <div className="pointer-events-none absolute left-0 top-0 flex gap-4 text-[10px] uppercase tracking-wide2">
        <span className="text-accent/70">CPU</span>
        <span className="text-status-nominal/70">Memory</span>
        <span className="text-[#9f8cff]/70">GPU</span>
      </div>
    </div>
  );
}
