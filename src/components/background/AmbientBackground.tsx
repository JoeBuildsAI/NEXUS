import { useEffect, useRef } from "react";
import { useSettingsStore } from "@/state/settingsStore";

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  r: number;
}

/**
 * Procedural ambient background: slow-drifting depth particles over a deep
 * radial gradient. Architected so richer scenes (WebGL/Three.js, video,
 * contextual artwork) can replace or layer on top later.
 *
 * Performance: single canvas, rAF loop, pauses when reduced motion is on or the
 * document is hidden. Particle count scales with the configured intensity.
 */
export function AmbientBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intensity = useSettingsStore((s) => s.appearance.backgroundIntensity);
  const reducedMotion = useSettingsStore((s) => s.appearance.reducedMotion);
  const animationsEnabled = useSettingsStore((s) => s.appearance.animationsEnabled);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const count = Math.round(24 + (intensity / 100) * 90);
    const particles: Particle[] = [];

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const seed = () => {
      particles.length = 0;
      for (let i = 0; i < count; i++) {
        const z = Math.random();
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          z,
          vx: (Math.random() - 0.5) * 0.12 * (0.3 + z),
          vy: (Math.random() - 0.5) * 0.12 * (0.3 + z),
          r: 0.5 + z * 1.8,
        });
      }
    };

    resize();
    seed();

    const still = reducedMotion || !animationsEnabled;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const opacityScale = 0.25 + (intensity / 100) * 0.6;
      for (const p of particles) {
        if (!still) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < -10) p.x = width + 10;
          if (p.x > width + 10) p.x = -10;
          if (p.y < -10) p.y = height + 10;
          if (p.y > height + 10) p.y = -10;
        }
        const alpha = (0.15 + p.z * 0.5) * opacityScale;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(150, 210, 230, ${alpha})`;
        ctx.fill();
      }
      if (!still) raf = requestAnimationFrame(draw);
    };

    draw();

    const onResize = () => {
      resize();
      seed();
    };
    window.addEventListener("resize", onResize);

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else if (!still) {
        raf = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intensity, reducedMotion, animationsEnabled]);

  const bgOpacity = 0.4 + (intensity / 100) * 0.6;

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-void-950">
      {/* Deep radial gradient base */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 50% -10%, rgba(30,55,70,0.55) 0%, rgba(10,14,20,0.9) 45%, #05070a 100%)",
          opacity: bgOpacity,
        }}
      />
      {/* Subtle vignette + grid */}
      <div className="absolute inset-0 bg-grid opacity-40" />
      {/* Slow atmospheric glow blobs */}
      <div
        className="absolute left-1/4 top-1/3 h-[40vh] w-[40vw] rounded-full blur-[120px]"
        style={{ background: "rgba(56,180,207,0.10)" }}
      />
      <div
        className="absolute right-1/4 bottom-1/4 h-[35vh] w-[35vw] rounded-full blur-[120px]"
        style={{ background: "rgba(94,110,230,0.08)" }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(100% 100% at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </div>
  );
}
