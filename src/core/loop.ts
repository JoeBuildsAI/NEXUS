/**
 * Segment (A–B) looping model. Pure helpers; the player applies them against
 * the <video> element. "Precise segment loop": we seek back to A the moment the
 * playhead reaches B (frame callbacks / timeupdate), not at `ended`. HTML video
 * seeks land on decodable positions, so it is precise, not frame-perfect.
 */

export type LoopMode = "off" | "full" | "ab";

export interface Segment {
  readonly a: number;
  readonly b: number;
}

/** Shortest segment we allow — below this a loop is a stutter, not a segment. */
export const MIN_SEGMENT_SECONDS = 0.5;

export type SegmentError = "duration-unknown" | "a-out-of-range" | "b-out-of-range" | "b-before-a" | "too-short";

/** Validate and clamp a proposed segment against the known duration (null when unknown). */
export function validateSegment(a: number | null, b: number | null, duration: number | null): { ok: true; segment: Segment } | { ok: false; error: SegmentError } {
  if (a == null || b == null) return { ok: false, error: "b-before-a" };
  if (!Number.isFinite(a) || a < 0) return { ok: false, error: "a-out-of-range" };
  if (!Number.isFinite(b)) return { ok: false, error: "b-out-of-range" };
  if (duration != null && Number.isFinite(duration) && duration > 0) {
    if (a >= duration) return { ok: false, error: "a-out-of-range" };
    if (b > duration + 0.001) return { ok: false, error: "b-out-of-range" };
  } else if (duration == null) {
    // Unknown duration: allow A/B only if both are finite and ordered; range checks come later.
  }
  if (b <= a) return { ok: false, error: "b-before-a" };
  if (b - a < MIN_SEGMENT_SECONDS) return { ok: false, error: "too-short" };
  return { ok: true, segment: { a: round3(a), b: round3(b) } };
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Decide what the player should do for the current playhead.
 *  - "seek-a": we reached/passed B → jump to A
 *  - "none": keep playing
 * `lead` compensates for callback latency so long segments don't overshoot B
 * by a full timeupdate interval.
 */
export function segmentAction(current: number, segment: Segment, lead = 0.03): "seek-a" | "none" {
  if (current >= segment.b - lead) return "seek-a";
  return "none";
}

/** Where to start when engaging A–B from an arbitrary position. */
export function entryPosition(current: number, segment: Segment): number {
  return current < segment.a || current >= segment.b ? segment.a : current;
}

/** Cycle used by the L shortcut / loop button. A–B is only offered when a segment exists. */
export function nextLoopMode(mode: LoopMode, hasSegment: boolean): LoopMode {
  if (mode === "off") return "full";
  if (mode === "full") return hasSegment ? "ab" : "off";
  return "off";
}

export function formatClock(seconds: number, withMillis = false): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
  const base = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return withMillis ? `${base}.${String(ms).padStart(3, "0")}` : base;
}
