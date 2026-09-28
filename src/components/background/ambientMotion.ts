/**
 * Ambient motion is decoration: it must cost the same on a 240 Hz gaming
 * monitor as on a 60 Hz laptop. Everything runs off one frame-limited clock and
 * moves by elapsed time, never by frame count.
 */
export type BackgroundPerformance = "full" | "balanced" | "minimal";

/** Minimum milliseconds between ambient frames per performance tier. */
export function ambientFrameInterval(perf: BackgroundPerformance): number {
  return perf === "full" ? 1000 / 30 : perf === "balanced" ? 1000 / 20 : 1000 / 10;
}

/** Whether a rAF tick should render, given the last rendered timestamp. */
export function shouldRender(now: number, last: number, interval: number): boolean {
  return now - last >= interval - 1;
}

/** Particle step scale: velocities were tuned per 60 Hz frame. */
export function stepScale(dtMs: number): number {
  return Math.min(dtMs, 250) / (1000 / 60);
}

const DRIFTS: [from: [number, number, number], to: [number, number, number]][] = [
  [[-6, -4, 1], [8, 6, 1.12]],
  [[5, 6, 1.08], [-7, -5, 0.96]],
  [[-4, 7, 0.95], [6, -6, 1.1]],
];

/** Transform for light field `i` at time `t` (s): ease-in-out, alternating, like the former CSS keyframes. */
export function driftTransform(i: number, tSec: number, periodSec: number): string {
  const [from, to] = DRIFTS[i % 3]!;
  const phase = (tSec / periodSec) % 2;
  const p = phase < 1 ? phase : 2 - phase;
  const e = 0.5 - 0.5 * Math.cos(Math.PI * p);
  const v = from.map((f, k) => f + (to[k]! - f) * e);
  return `translate3d(${v[0]!.toFixed(2)}%, ${v[1]!.toFixed(2)}%, 0) scale(${v[2]!.toFixed(4)})`;
}
