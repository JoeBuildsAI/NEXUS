/**
 * Adaptive video wall — deterministic layout optimizer.
 *
 * Given the workspace size and the active players (with source aspect ratios),
 * enumerate candidate arrangements, score each by how much *useful video* it
 * displays, and pick the best. Pure and deterministic: same inputs → same
 * layout, so nothing jumps while videos play. A stability bonus keeps the
 * previous arrangement when the difference is marginal.
 */

export type WallMode = "auto" | "grid" | "primary" | "focus";
export type FitMode = "fit" | "fill" | "smart";

export interface LayoutPlayer {
  /** Stable slot index (wall order). */
  readonly index: number;
  /** Source width / height. Unknown → 16/9 assumed. */
  readonly aspect: number | null;
}

export interface LayoutInput {
  readonly width: number;
  readonly height: number;
  readonly players: readonly LayoutPlayer[];
  readonly primaryIndex: number | null;
  readonly focusIndex?: number | null;
  readonly mode: WallMode;
  readonly gap?: number;
  readonly minTile?: { width: number; height: number };
  /** Previous layout id (stability). */
  readonly previousId?: string | null;
  /** Fit mode used for scoring the effective displayed area. */
  readonly fit?: FitMode;
}

export interface Tile {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LayoutResult {
  readonly id: string;
  readonly tiles: readonly Tile[];
  readonly score: number;
  /** Fraction of the viewport showing video (0–1), for diagnostics/tests. */
  readonly coverage: number;
}

const DEFAULT_ASPECT = 16 / 9;
/**
 * Crop fraction SMART FILL tolerates before falling back to FIT. A full tile is
 * preferred over letterboxing when the crop is reasonable: 4:3 in a 16:9 tile
 * (25%), 21:9 in 16:9 (24%) and 4:3 on a ~1.9:1 wall (30%) fill; portrait in
 * landscape (68%) or square in 16:9 (44%) would lose too much and letterbox.
 */
export const SMART_FILL_MAX_CROP = 0.34;

export function cropFraction(tileAspect: number, sourceAspect: number): number {
  if (!(tileAspect > 0) || !(sourceAspect > 0)) return 0;
  return 1 - Math.min(tileAspect / sourceAspect, sourceAspect / tileAspect);
}

/** Resolve the effective object-fit for a tile under a fit mode. */
export function resolveFit(mode: FitMode, tileAspect: number, sourceAspect: number | null): "contain" | "cover" {
  if (mode === "fit") return "contain";
  if (mode === "fill") return "cover";
  if (sourceAspect == null) return "contain";
  return cropFraction(tileAspect, sourceAspect) <= SMART_FILL_MAX_CROP ? "cover" : "contain";
}

/** Displayed video area (px²) for a tile under FIT (letterboxed). */
export function fitArea(w: number, h: number, sourceAspect: number): number {
  const tileAspect = w / h;
  return tileAspect > sourceAspect ? h * h * sourceAspect : (w * w) / sourceAspect;
}

// ------------------------------------------------------------- slicing trees

/**
 * A wall is a guillotine (slicing) tree: every internal node splits its
 * rectangle side-by-side ("h") or stacked ("v"), leaves hold one video. The
 * natural aspect of a tree is what its videos need to tile WITHOUT crop:
 * side-by-side sums aspects, stacked sums inverse aspects. Splits are sized by
 * those natural aspects, so the whole wall is always covered (no dead regions
 * by construction) and every tile shares one modest distortion that Smart Fill
 * absorbs as crop. The search picks the tree + assignment whose natural aspect
 * best matches the wall, which is what lets portraits and landscapes interlock.
 */
type Tree = { kind: "leaf"; pos: number } | { kind: "h" | "v"; a: Tree; b: Tree };

interface TreeCand {
  tree: Tree;
  aspect: number;
  /** Smallest / largest leaf area when laid out at its natural aspect (1 = balanced). */
  balance: number;
}

function naturalAspect(kind: "h" | "v", a: number, b: number): number {
  return kind === "h" ? a + b : 1 / (1 / a + 1 / b);
}

/** Leaf areas of a tree laid out at its natural aspect with unit height. */
function leafAreas(t: Tree, aspects: readonly number[], w: number, h: number, out: number[]): void {
  if (t.kind === "leaf") {
    out.push(w * h);
    return;
  }
  const aa = treeAspect(t.a, aspects);
  const ab = treeAspect(t.b, aspects);
  if (t.kind === "h") {
    const wa = (w * aa) / (aa + ab);
    leafAreas(t.a, aspects, wa, h, out);
    leafAreas(t.b, aspects, w - wa, h, out);
  } else {
    const ha = (h * (1 / aa)) / (1 / aa + 1 / ab);
    leafAreas(t.a, aspects, w, ha, out);
    leafAreas(t.b, aspects, w, h - ha, out);
  }
}

function treeAspect(t: Tree, aspects: readonly number[]): number {
  return t.kind === "leaf" ? aspects[t.pos]! : naturalAspect(t.kind, treeAspect(t.a, aspects), treeAspect(t.b, aspects));
}

function treeId(t: Tree, ordered: readonly LayoutPlayer[]): string {
  return t.kind === "leaf" ? String(ordered[t.pos]!.index) : `${t.kind}(${treeId(t.a, ordered)},${treeId(t.b, ordered)})`;
}

/** Keep a bounded, diverse set per subset: best balance per aspect bucket. */
const BUCKETS_PER_SUBSET = 24;
function prune(cands: TreeCand[]): TreeCand[] {
  const byBucket = new Map<number, TreeCand>();
  for (const c of cands) {
    const k = Math.round(Math.log(c.aspect) * 10);
    const cur = byBucket.get(k);
    if (!cur || c.balance > cur.balance + 1e-9) byBucket.set(k, c);
  }
  return [...byBucket.values()].sort((x, y) => y.balance - x.balance || x.aspect - y.aspect).slice(0, BUCKETS_PER_SUBSET);
}

/**
 * All slicing trees over every assignment of the n (≤ 6) videos, built bottom-up
 * over subsets. Intermediate subsets are pruned to a bounded diverse set; the
 * full set is enumerated exhaustively from those. Deterministic.
 */
export function slicingCandidates(aspects: readonly number[]): TreeCand[] {
  const n = aspects.length;
  const full = (1 << n) - 1;
  const memo = new Map<number, TreeCand[]>();
  const build = (mask: number): TreeCand[] => {
    const hit = memo.get(mask);
    if (hit) return hit;
    let out: TreeCand[];
    if ((mask & (mask - 1)) === 0) {
      const pos = Math.log2(mask);
      out = [{ tree: { kind: "leaf", pos }, aspect: aspects[pos]!, balance: 1 }];
    } else {
      out = [];
      const low = mask & -mask;
      // Submasks containing the lowest bit: each unordered split once.
      for (let a = (mask - 1) & mask; a > 0; a = (a - 1) & mask) {
        if (!(a & low)) continue;
        const b = mask ^ a;
        for (const ca of build(a)) for (const cb of build(b)) {
          for (const kind of ["h", "v"] as const) {
            for (const [x, y] of [[ca, cb], [cb, ca]] as const) {
              const tree: Tree = { kind, a: x.tree, b: y.tree };
              const aspect = naturalAspect(kind, x.aspect, y.aspect);
              const areas: number[] = [];
              leafAreas(tree, aspects, aspect, 1, areas);
              out.push({ tree, aspect, balance: Math.min(...areas) / Math.max(...areas) });
            }
          }
        }
      }
      if (mask !== full) out = prune(out);
    }
    memo.set(mask, out);
    return out;
  };
  return build(full);
}

/** Lay a tree into a pixel rect; gutters are taken from the split dimension. */
function place(t: Tree, aspects: readonly number[], x: number, y: number, w: number, h: number, gap: number, out: { pos: number; x: number; y: number; w: number; h: number }[]): void {
  if (t.kind === "leaf") {
    out.push({ pos: t.pos, x, y, w, h });
    return;
  }
  const aa = treeAspect(t.a, aspects);
  const ab = treeAspect(t.b, aspects);
  if (t.kind === "h") {
    const avail = Math.max(0, w - gap);
    const wa = Math.round((avail * aa) / (aa + ab));
    place(t.a, aspects, x, y, wa, h, gap, out);
    place(t.b, aspects, x + wa + gap, y, w - wa - gap, h, gap, out);
  } else {
    const avail = Math.max(0, h - gap);
    const ha = Math.round((avail * (1 / aa)) / (1 / aa + 1 / ab));
    place(t.a, aspects, x, y, w, ha, gap, out);
    place(t.b, aspects, x, y + ha + gap, w, h - ha - gap, gap, out);
  }
}

// --------------------------------------------------------------------- scoring

/**
 * Pick the densest wall. Cost terms, in priority order:
 *   dead area (letterboxed / unused viewport)   — dominant
 *   tiles below the minimum size or far below an equal share — very high
 *   Smart Fill crop (area-weighted)             — moderate
 *   size imbalance between peers                 — mild (strong in Grid)
 * Primary mode rewards a dominant primary; Focus shows one player.
 */
export function optimizeLayout(input: LayoutInput): LayoutResult {
  const { width, height } = input;
  const gap = input.gap ?? 4;
  const fit = input.fit ?? "smart";
  const minTile = input.minTile ?? { width: 160, height: 90 };
  const players = input.players;
  if (players.length === 0 || width <= 0 || height <= 0) return { id: "empty", tiles: [], score: 0, coverage: 0 };

  const focusLead = input.focusIndex ?? input.primaryIndex ?? players[0]!.index;
  const ordered = input.mode === "focus" ? [players.find((p) => p.index === focusLead) ?? players[0]!] : [...players];
  const n = ordered.length;
  const aspects = ordered.map((p) => (p.aspect && p.aspect > 0 ? p.aspect : DEFAULT_ASPECT));
  const viewportArea = width * height;
  const primary = input.mode !== "focus" && input.primaryIndex != null ? input.primaryIndex : null;
  const equalShare = viewportArea / n;
  const balanceWeight = input.mode === "grid" ? 0.7 : primary != null ? 0 : 0.45;

  let best: LayoutResult | null = null;
  for (const cand of slicingCandidates(aspects)) {
    const rects: { pos: number; x: number; y: number; w: number; h: number }[] = [];
    place(cand.tree, aspects, 0, 0, width, height, gap, rects);
    let shown = 0;
    let cropArea = 0;
    let cost = 0;
    let smallest = Infinity;
    let largest = 0;
    let primaryArea = 0;
    let primaryLargest = true;
    const tiles: Tile[] = rects.map((r) => {
      const w = Math.max(1, r.w);
      const h = Math.max(1, r.h);
      const area = w * h;
      const src = aspects[r.pos]!;
      const crop = cropFraction(w / h, src);
      const covered = fit === "fill" || (fit === "smart" && crop <= SMART_FILL_MAX_CROP);
      shown += covered ? area : fitArea(w, h, src);
      if (covered) cropArea += crop * area;
      if (w < minTile.width || h < minTile.height) cost += 2;
      if (n > 1 && area < 0.3 * equalShare) cost += 1.5 * (1 - area / (0.3 * equalShare));
      smallest = Math.min(smallest, area);
      largest = Math.max(largest, area);
      if (primary != null && ordered[r.pos]!.index === primary) primaryArea = area;
      return { index: ordered[r.pos]!.index, x: r.x, y: r.y, width: w, height: h };
    });
    if (primary != null) primaryLargest = primaryArea >= largest - 1;
    const coverage = shown / viewportArea;
    cost += 4 * (1 - coverage);
    cost += 1.2 * (cropArea / viewportArea);
    if (n > 1) cost += balanceWeight * (1 - smallest / largest);
    if (primary != null) {
      // Primary mode intentionally trades balance (and some crop) for a dominant player.
      const share = primaryArea / viewportArea;
      cost -= 1.2 * Math.min(share, 0.6);
      if (share < 0.4) cost += 0.3;
      if (!primaryLargest) cost += 1;
    }
    const id = treeId(cand.tree, ordered);
    if (input.previousId && id === input.previousId) cost -= 0.02;
    const result: LayoutResult = { id, tiles: [...tiles].sort((a, b) => a.index - b.index), score: -cost, coverage };
    if (!best || result.score > best.score + 1e-9 || (Math.abs(result.score - best.score) <= 1e-9 && id < best.id)) best = result;
  }
  return best ?? { id: "empty", tiles: [], score: 0, coverage: 0 };
}
