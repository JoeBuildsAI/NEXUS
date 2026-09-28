import { describe, expect, it } from "vitest";
import { cropFraction, fitArea, optimizeLayout, resolveFit, SMART_FILL_MAX_CROP, type LayoutPlayer } from "./layout";

const L = 16 / 9;
const P = 9 / 16;
const players = (aspects: (number | null)[]): LayoutPlayer[] => aspects.map((aspect, index) => ({ index, aspect }));
const run = (aspects: (number | null)[], opts: Partial<Parameters<typeof optimizeLayout>[0]> = {}) =>
  optimizeLayout({ width: 1600, height: 900, players: players(aspects), primaryIndex: null, mode: "auto", gap: 4, ...opts });

function noOverlap(tiles: readonly { x: number; y: number; width: number; height: number }[]) {
  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) {
      const a = tiles[i]!, b = tiles[j]!;
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      if (overlap) return false;
    }
  }
  return true;
}

describe("layout optimizer", () => {
  it("one video fills essentially the whole workspace", () => {
    const r = run([L]);
    expect(r.tiles).toHaveLength(1);
    expect(r.tiles[0]!.width).toBe(1600);
    expect(r.tiles[0]!.height).toBe(900);
    expect(r.coverage).toBeGreaterThan(0.99);
  });

  it("two landscape videos on a landscape wall sit side by side (more area than stacked)", () => {
    const r = run([L, L]);
    expect(r.id).toBe("rows:2");
    expect(noOverlap(r.tiles)).toBe(true);
  });

  it("two portrait videos prefer a side-by-side split; two landscape on a tall wall stack", () => {
    expect(run([P, P]).id).toBe("rows:2");
    const tall = run([L, L], { width: 900, height: 1600 });
    expect(tall.tiles[0]!.x).toBe(tall.tiles[1]!.x); // stacked
    expect(tall.tiles[0]!.y).not.toBe(tall.tiles[1]!.y);
  });

  it("mixed portrait/landscape still produces a full-coverage, non-overlapping arrangement", () => {
    const r = run([L, P, L]);
    expect(r.tiles).toHaveLength(3);
    expect(noOverlap(r.tiles)).toBe(true);
    expect(r.coverage).toBeGreaterThan(0.75);
  });

  it("a landscape + a portrait video pack by aspect instead of a 50/50 split", () => {
    const r = run([L, P], { width: 1408, height: 700 });
    expect(r.id.startsWith("wrows") || r.id.startsWith("wcols")).toBe(true);
    const land = r.tiles.find((t) => t.index === 0)!, port = r.tiles.find((t) => t.index === 1)!;
    expect(land.width).toBeGreaterThan(port.width * 2);
    expect(r.coverage).toBeGreaterThan(0.9);
    expect(noOverlap(r.tiles)).toBe(true);
  });

  it("four landscape videos become a balanced 2×2", () => {
    const r = run([L, L, L, L]);
    expect(r.id).toBe("rows:2-2");
    const widths = new Set(r.tiles.map((t) => t.width));
    expect(widths.size).toBe(1);
  });

  it("five and six players never leave a tile below the minimum size at 1080p and use ≥ 60% of the wall", () => {
    for (const n of [5, 6]) {
      const r = run(Array(n).fill(L), { width: 1800, height: 940 });
      expect(r.tiles).toHaveLength(n);
      expect(noOverlap(r.tiles)).toBe(true);
      expect(r.tiles.every((t) => t.width >= 160 && t.height >= 90)).toBe(true);
      expect(r.coverage).toBeGreaterThan(0.6);
    }
  });

  it("a primary player dominates the wall", () => {
    const r = run([L, L, L, L], { primaryIndex: 2 });
    const primary = r.tiles.find((t) => t.index === 2)!;
    const share = (primary.width * primary.height) / (1600 * 900);
    expect(share).toBeGreaterThan(0.45);
    expect(r.id.startsWith("pl") || r.id.startsWith("pt")).toBe(true);
  });

  it("focus mode shows only the focused player at full size", () => {
    const r = run([L, P, L], { mode: "focus", focusIndex: 1 });
    expect(r.tiles).toHaveLength(1);
    expect(r.tiles[0]!.index).toBe(1);
    expect(r.tiles[0]!.width).toBe(1600);
  });

  it("is deterministic and stable: identical inputs give identical ids; the previous layout wins ties", () => {
    const a = run([L, L, L]);
    const b = run([L, L, L]);
    expect(a.id).toBe(b.id);
    const prev = run([L, L, L], { previousId: "cols:1-2" });
    // Stability bonus only matters when scores are close; it must never break coverage badly.
    expect(prev.coverage).toBeGreaterThan(a.coverage - 0.1);
  });

  it("handles ultrawide walls and 4K sizes without overlap", () => {
    const uw = run([L, L, L], { width: 3440, height: 1440 });
    expect(noOverlap(uw.tiles)).toBe(true);
    const k4 = run([L, P, L, L, P, L], { width: 3840, height: 2000 });
    expect(k4.tiles).toHaveLength(6);
    expect(noOverlap(k4.tiles)).toBe(true);
    expect(k4.tiles.every((t) => t.width >= 160)).toBe(true);
  });

  it("unknown aspect ratios are treated as 16:9 and never crash", () => {
    const r = run([null, null]);
    expect(r.tiles).toHaveLength(2);
  });

  it("2–4 portrait videos pack into a single row of tall, narrow tiles (not a wasteful grid)", () => {
    // On a landscape wall the efficient packing for a handful of portraits is a row of
    // full-height columns — each tile taller than wide — rather than 16:9-shaped cells.
    for (const n of [2, 3, 4]) {
      const r = run(Array(n).fill(P));
      expect(r.tiles).toHaveLength(n);
      expect(noOverlap(r.tiles)).toBe(true);
      expect(r.tiles.every((t) => t.height > t.width)).toBe(true);
    }
  });

  it("all-portrait sets keep useful coverage and never overlap for every count", () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const r = run(Array(n).fill(P), { width: 1920, height: 1080 });
      expect(r.tiles).toHaveLength(n);
      expect(noOverlap(r.tiles)).toBe(true);
      expect(r.coverage).toBeGreaterThan(0.4);
    }
  });

  it("all-landscape sets stay high-coverage and non-overlapping for every count", () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const r = run(Array(n).fill(L), { width: 1920, height: 1080 });
      expect(r.tiles).toHaveLength(n);
      expect(noOverlap(r.tiles)).toBe(true);
      expect(r.coverage).toBeGreaterThan(0.45);
    }
    // Four 16:9 videos tile a 16:9 wall almost perfectly (2×2 of 16:9 cells).
    expect(run(Array(4).fill(L), { width: 1920, height: 1080 }).coverage).toBeGreaterThan(0.9);
  });

  it("every count 1..6 produces exactly n non-overlapping tiles above the minimum size", () => {
    for (let n = 1; n <= 6; n++) {
      const r = run(Array(n).fill(L), { width: 1800, height: 940 });
      expect(r.tiles).toHaveLength(n);
      expect(noOverlap(r.tiles)).toBe(true);
      expect(r.tiles.every((t) => t.width >= 160 && t.height >= 90)).toBe(true);
    }
  });

  it("a mixed 6-video set packs without overlap and keeps good coverage", () => {
    const r = run([L, P, L, P, L, P], { width: 1920, height: 1080 });
    expect(r.tiles).toHaveLength(6);
    expect(noOverlap(r.tiles)).toBe(true);
    expect(r.coverage).toBeGreaterThan(0.6);
  });

  it("no-distortion invariant: smart fill only crops within the bounded threshold, never stretches", () => {
    // For every tile the layout produces, the chosen fit is contain or cover — never a
    // distorting scale — and when it covers, the cropped fraction stays within budget.
    for (const set of [[P, P, P], [L, L, L, L], [L, P, L, P], [P, L, P, L, P, L]]) {
      const r = run(set);
      for (const t of r.tiles) {
        const src = set[r.tiles.indexOf(t)]!;
        const tileAspect = t.width / t.height;
        const fit = resolveFit("smart", tileAspect, src);
        expect(fit === "contain" || fit === "cover").toBe(true);
        if (fit === "cover") expect(cropFraction(tileAspect, src)).toBeLessThanOrEqual(SMART_FILL_MAX_CROP + 1e-9);
      }
    }
  });

  it("re-layouts deterministically when a video is added or removed", () => {
    const two = run([L, L]);
    const three = run([L, L, P]);
    const back = run([L, L]);
    expect(three.tiles).toHaveLength(3);
    expect(noOverlap(three.tiles)).toBe(true);
    expect(back.id).toBe(two.id); // removing returns to the same arrangement
  });
});

describe("fit resolution", () => {
  it("smart fill across real-world aspect ratios: fill when the crop is reasonable, never absurd", () => {
    const tile169 = 16 / 9;
    const cases: [string, number, number, "cover" | "contain"][] = [
      ["16:9 in 16:9", tile169, 16 / 9, "cover"],
      ["4:3 in 16:9", tile169, 4 / 3, "cover"],
      ["21:9 ultrawide in 16:9", tile169, 21 / 9, "cover"],
      ["4:3 on a 2134x1160 wall", 2134 / 1160, 4 / 3, "cover"],
      ["16:9 in a 4:3 tile", 4 / 3, 16 / 9, "cover"],
      ["square in a 4:3 tile", 4 / 3, 1, "cover"],
      ["square in 16:9", tile169, 1, "contain"],
      ["9:16 portrait in 16:9", tile169, 9 / 16, "contain"],
      ["phone 9:19.5 in a portrait 9:16 tile", 9 / 16, 9 / 19.5, "cover"],
      ["phone 9:19.5 in 16:9", tile169, 9 / 19.5, "contain"],
      ["32:9 super-ultrawide in 16:9", tile169, 32 / 9, "contain"],
    ];
    for (const [name, tile, src, want] of cases) expect(resolveFit("smart", tile, src), name).toBe(want);
  });

  it("smart fill covers when cropping is small and letterboxes when it is large", () => {
    expect(resolveFit("smart", 16 / 9, 16 / 9)).toBe("cover");
    expect(resolveFit("smart", 16 / 9, 4 / 3)).toBe(cropFraction(16 / 9, 4 / 3) <= SMART_FILL_MAX_CROP ? "cover" : "contain");
    expect(resolveFit("smart", 16 / 9, 9 / 16)).toBe("contain");
    expect(resolveFit("fit", 16 / 9, 16 / 9)).toBe("contain");
    expect(resolveFit("fill", 16 / 9, 9 / 16)).toBe("cover");
    expect(resolveFit("smart", 16 / 9, null)).toBe("contain");
  });

  it("crop fraction and fit area are symmetric and bounded", () => {
    expect(cropFraction(16 / 9, 16 / 9)).toBe(0);
    expect(cropFraction(16 / 9, 9 / 16)).toBeCloseTo(cropFraction(9 / 16, 16 / 9));
    expect(fitArea(1600, 900, 16 / 9)).toBe(1600 * 900);
    expect(fitArea(1600, 900, 9 / 16)).toBeLessThan(1600 * 900 * 0.35);
  });
});
