import { describe, expect, it } from "vitest";
import { entryPosition, formatClock, nextLoopMode, segmentAction, validateSegment } from "./loop";

describe("A–B segment validation", () => {
  it("accepts an ordered in-range segment and rounds to milliseconds", () => {
    const r = validateSegment(495.0004, 735.9996, 1200);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.segment).toEqual({ a: 495, b: 736 });
  });
  it("rejects B before A, B past duration, A past duration, negatives and stutters", () => {
    expect(validateSegment(10, 5, 100)).toEqual({ ok: false, error: "b-before-a" });
    expect(validateSegment(10, 101, 100)).toEqual({ ok: false, error: "b-out-of-range" });
    expect(validateSegment(100, 120, 100)).toEqual({ ok: false, error: "a-out-of-range" });
    expect(validateSegment(-1, 5, 100)).toEqual({ ok: false, error: "a-out-of-range" });
    expect(validateSegment(10, 10.2, 100)).toEqual({ ok: false, error: "too-short" });
    expect(validateSegment(null, 5, 100).ok).toBe(false);
  });
  it("tolerates unknown duration when both points are finite", () => {
    expect(validateSegment(2, 12, null).ok).toBe(true);
  });
  it("allows B exactly at the end", () => {
    expect(validateSegment(1190, 1200, 1200).ok).toBe(true);
  });
});

describe("segment playback decisions", () => {
  const seg = { a: 495, b: 735 };
  it("seeks to A when the playhead reaches B (with a small lead), otherwise nothing", () => {
    expect(segmentAction(600, seg)).toBe("none");
    expect(segmentAction(734.99, seg)).toBe("seek-a");
    expect(segmentAction(736, seg)).toBe("seek-a");
    expect(segmentAction(734.9, seg)).toBe("none");
  });
  it("engaging A–B from outside the segment starts at A; inside keeps position", () => {
    expect(entryPosition(10, seg)).toBe(495);
    expect(entryPosition(800, seg)).toBe(495);
    expect(entryPosition(600, seg)).toBe(600);
  });
  it("loop mode cycles OFF → FULL → A–B (only with a segment) → OFF", () => {
    expect(nextLoopMode("off", false)).toBe("full");
    expect(nextLoopMode("full", false)).toBe("off");
    expect(nextLoopMode("full", true)).toBe("ab");
    expect(nextLoopMode("ab", true)).toBe("off");
  });
  it("formats clocks with and without millis", () => {
    expect(formatClock(495)).toBe("08:15");
    expect(formatClock(735.5, true)).toBe("12:15.500");
    expect(formatClock(3661)).toBe("1:01:01");
    expect(formatClock(NaN)).toBe("00:00");
  });
});
