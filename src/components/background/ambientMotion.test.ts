import { describe, expect, it } from "vitest";
import { ambientFrameInterval, driftTransform, shouldRender, stepScale } from "./ambientMotion";

describe("ambient motion", () => {
  it("renders at a bounded rate regardless of display refresh (240 Hz ≈ 4.17 ms vsync)", () => {
    const interval = ambientFrameInterval("balanced");
    let last = 0;
    let frames = 0;
    for (let t = 0; t <= 1000; t += 1000 / 240) if (shouldRender(t, last, interval)) { frames++; last = t; }
    expect(frames).toBeGreaterThanOrEqual(18);
    expect(frames).toBeLessThanOrEqual(21);
    expect(ambientFrameInterval("full")).toBeLessThan(ambientFrameInterval("minimal"));
  });

  it("moves by elapsed time: one second is the same distance at any frame rate", () => {
    const at = (hz: number) => { let d = 0; for (let i = 0; i < hz; i++) d += stepScale(1000 / hz); return d; };
    expect(at(60)).toBeCloseTo(60, 5);
    expect(at(20)).toBeCloseTo(60, 5);
    expect(stepScale(5000)).toBeLessThanOrEqual(15); // resuming after a pause never teleports particles
  });

  it("drift alternates smoothly between its keyframes", () => {
    expect(driftTransform(0, 0, 40)).toBe("translate3d(-6.00%, -4.00%, 0) scale(1.0000)");
    expect(driftTransform(0, 40, 40)).toBe("translate3d(8.00%, 6.00%, 0) scale(1.1200)");
    expect(driftTransform(0, 80, 40)).toBe(driftTransform(0, 0, 40));
  });
});
