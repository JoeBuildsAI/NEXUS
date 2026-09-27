import { useEffect, useRef } from "react";
import { useSettingsStore } from "@/state/settingsStore";
import { useModeStore } from "@/state/modeStore";
import { useNavigationStore } from "@/state/navigationStore";
import { ENVIRONMENTS, MODE_MOOD } from "./environments";

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  r: number;
}

/**
 * Layered ambient environment:
 *   gradient base → light fields (CSS, GPU-composited) → canvas particles /
 *   neural links → noise → vignette → cursor light.
 *
 * Presets live in `environments.ts`; the active operating mode modulates energy
 * and brightness. Performance tiers scale particle counts and disable links;
 * reduced motion freezes drift. Everything pauses when the document is hidden.
 */
export function AmbientBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const appearance = useSettingsStore((s) => s.appearance);
  const mode = useModeStore((s) => s.current);
  const gameRunning = useModeStore((s) => s.gameRunning);
  const screen = useNavigationStore((s) => s.screen);

  const spec = ENVIRONMENTS[appearance.environment];
  // Media screen blacks out the environment regardless of mode.
  const mood = screen === "media" ? MODE_MOOD.media : MODE_MOOD[mode];
  const perf = appearance.backgroundPerformance;
  const still = appearance.reducedMotion || !appearance.animationsEnabled;

  // Effective intensity: performance tier and in-game state reduce load.
  const perfScale = perf === "full" ? 1 : perf === "balanced" ? 0.65 : 0.25;
  const gameScale = gameRunning ? 0.3 : 1;
  const intensity = (appearance.backgroundIntensity / 100) * perfScale * gameScale;

  // Particles / links
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let height = 0;
    const count = Math.round(110 * spec.density * intensity);
    const linkMode = appearance.environment === "neural" && perf !== "minimal";
    const particles: Particle[] = [];
    const [pr, pg, pb] = spec.particleColor;
    const speed = spec.speed * mood.energy * (still ? 0 : 1);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, perf === "full" ? 2 : 1.25);
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
          vx: (Math.random() - 0.5) * 0.14 * (0.3 + z),
          vy: (Math.random() - 0.5) * 0.14 * (0.3 + z),
          r: 0.5 + z * (linkMode ? 1.4 : 1.8),
        });
      }
    };
    resize();
    seed();

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const alphaScale = 0.3 + intensity * 0.7;
      for (const p of particles) {
        if (speed > 0) {
          p.x += p.vx * speed;
          p.y += p.vy * speed;
          if (p.x < -10) p.x = width + 10;
          if (p.x > width + 10) p.x = -10;
          if (p.y < -10) p.y = height + 10;
          if (p.y > height + 10) p.y = -10;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${pr},${pg},${pb},${(0.15 + p.z * 0.5) * alphaScale})`;
        ctx.fill();
      }
      if (linkMode) {
        ctx.lineWidth = 0.6;
        const maxD = 130;
        for (let i = 0; i < particles.length; i++) {
          const a = particles[i]!;
          for (let j = i + 1; j < particles.length; j++) {
            const b = particles[j]!;
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < maxD * maxD) {
              const t = 1 - Math.sqrt(d2) / maxD;
              ctx.strokeStyle = `rgba(${pr},${pg},${pb},${t * 0.14 * alphaScale})`;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
        }
      }
      if (speed > 0) raf = requestAnimationFrame(draw);
    };
    draw();

    const onResize = () => {
      resize();
      seed();
      if (speed === 0) draw();
    };
    const onVis = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else if (speed > 0) raf = requestAnimationFrame(draw);
    };
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [spec, intensity, still, mood.energy, perf, appearance.environment]);

  // Cursor-reactive light (direct DOM write; no React re-render per move).
  useEffect(() => {
    const el = cursorRef.current;
    if (!el || !appearance.cursorLighting || still || perf === "minimal") return;
    let raf = 0;
    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let cx = tx;
    let cy = ty;
    // Only animate while the light is still catching up; idle cursor = zero work.
    const tick = () => {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      el.style.transform = `translate3d(${cx - 300}px, ${cy - 300}px, 0)`;
      if (Math.abs(tx - cx) > 0.3 || Math.abs(ty - cy) > 0.3) raf = requestAnimationFrame(tick);
      else raf = 0;
    };
    const onMove = (e: MouseEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
    };
  }, [appearance.cursorLighting, still, perf]);

  const lightOpacity = mood.brightness * (0.6 + intensity * 0.6);
  const driftDur = (s: number) => `${(s / Math.max(0.2, mood.energy)).toFixed(0)}s`;

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" style={{ background: spec.base[2] }}>
      <div
        className="absolute inset-0 transition-opacity duration-1000"
        style={{
          background: `radial-gradient(120% 80% at 50% -10%, ${spec.base[0]} 0%, ${spec.base[1]} 45%, ${spec.base[2]} 100%)`,
        }}
      />

      {/* Light fields */}
      {spec.lights.map((c, i) => (
        <div
          key={`${appearance.environment}-${i}`}
          className="absolute rounded-full blur-[140px] transition-opacity duration-1000"
          style={{
            width: `${38 + i * 6}vw`,
            height: `${38 + i * 6}vh`,
            left: `${[18, 62, 40, 75][i % 4]}%`,
            top: `${[28, 60, 78, 15][i % 4]}%`,
            background: c,
            opacity: lightOpacity,
            animation: still ? "none" : `nx-drift-${(i % 3) + 1} ${driftDur(38 + i * 9)} ease-in-out infinite alternate`,
            willChange: still ? "auto" : "transform",
          }}
        />
      ))}

      {spec.grid && <div className="absolute inset-0 bg-grid opacity-40" />}

      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Cursor light */}
      {appearance.cursorLighting && !still && perf !== "minimal" && (
        <div
          ref={cursorRef}
          className="absolute left-0 top-0 h-[600px] w-[600px] rounded-full"
          style={{
            background: `radial-gradient(circle, rgba(${spec.particleColor.join(",")},0.045) 0%, transparent 60%)`,
            willChange: "transform",
          }}
        />
      )}

      {spec.noise && <div className="absolute inset-0 nx-noise opacity-[0.035]" />}

      {mood.tint && (
        <div className="absolute inset-0 transition-opacity duration-1000" style={{ background: mood.tint }} />
      )}

      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(100% 100% at 50% 50%, transparent 55%, rgba(0,0,0,0.6) 100%)",
        }}
      />
    </div>
  );
}
