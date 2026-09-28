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

// ------------------------------------------------------------------ candidates

interface Candidate {
  id: string;
  /** Normalized rects (0–1) keyed by player order position. */
  rects: { x: number; y: number; w: number; h: number }[];
}

/** Rows of given sizes, equal heights; tiles in a row share width equally. */
function rowsLayout(sizes: number[], id: string): Candidate {
  const rects: Candidate["rects"] = [];
  const rowH = 1 / sizes.length;
  sizes.forEach((count, r) => {
    for (let c = 0; c < count; c++) rects.push({ x: c / count, y: r * rowH, w: 1 / count, h: rowH });
  });
  return { id, rects };
}

/** Columns of given sizes (transpose of rows). */
function colsLayout(sizes: number[], id: string): Candidate {
  const rects: Candidate["rects"] = [];
  const colW = 1 / sizes.length;
  sizes.forEach((count, c) => {
    for (let r = 0; r < count; r++) rects.push({ x: c * colW, y: r / count, w: colW, h: 1 / count });
  });
  return { id, rects };
}

/** Primary tile taking `frac` of the width (left) with the rest stacked vertically on the right. */
function primaryLeft(n: number, frac: number, id: string): Candidate {
  const rects: Candidate["rects"] = [{ x: 0, y: 0, w: frac, h: 1 }];
  const rest = n - 1;
  for (let i = 0; i < rest; i++) rects.push({ x: frac, y: i / rest, w: 1 - frac, h: 1 / rest });
  return { id, rects };
}

/** Primary tile taking `frac` of the height (top) with the rest in a row below. */
function primaryTop(n: number, frac: number, id: string): Candidate {
  const rects: Candidate["rects"] = [{ x: 0, y: 0, w: 1, h: frac }];
  const rest = n - 1;
  for (let i = 0; i < rest; i++) rects.push({ x: i / rest, y: frac, w: 1 / rest, h: 1 - frac });
  return { id, rects };
}

/** Primary left, secondaries in a 2-column block on the right (for 5–6 players). */
function primaryLeftGrid(n: number, frac: number, id: string): Candidate {
  const rects: Candidate["rects"] = [{ x: 0, y: 0, w: frac, h: 1 }];
  const rest = n - 1;
  const cols = 2;
  const rows = Math.ceil(rest / cols);
  for (let i = 0; i < rest; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const inRow = Math.min(cols, rest - r * cols);
    rects.push({ x: frac + (c / inRow) * (1 - frac), y: r / rows, w: (1 - frac) / inRow, h: 1 / rows });
  }
  return { id, rects };
}

/**
 * Aspect-weighted rows: within a row every tile gets width ∝ its aspect (so all
 * tiles in the row share the row height without letterboxing), and rows get
 * height ∝ 1/Σaspect so each row spans the full width. Perfect packing when
 * the sources cooperate; the scorer decides when it beats a uniform grid.
 */
function weightedRows(sizes: number[], aspects: number[], id: string): Candidate {
  const rects: Candidate["rects"] = [];
  let k = 0;
  const sums = sizes.map((count) => aspects.slice(k, (k += count)).reduce((a, b) => a + b, 0));
  const inv = sums.map((s) => 1 / s);
  const total = inv.reduce((a, b) => a + b, 0);
  let y = 0;
  k = 0;
  sizes.forEach((count, r) => {
    const h = inv[r]! / total;
    let x = 0;
    for (let c = 0; c < count; c++) {
      const w = aspects[k + c]! / sums[r]!;
      rects.push({ x, y, w, h });
      x += w;
    }
    k += count;
    y += h;
  });
  return { id, rects };
}

/** Transpose of weightedRows: columns of stacked tiles, heights ∝ 1/aspect. */
function weightedCols(sizes: number[], aspects: number[], id: string): Candidate {
  const rects: Candidate["rects"] = [];
  let k = 0;
  const sums = sizes.map((count) => aspects.slice(k, (k += count)).reduce((a, b) => a + 1 / b, 0));
  const inv = sums.map((s) => 1 / s);
  const total = inv.reduce((a, b) => a + b, 0);
  let x = 0;
  k = 0;
  sizes.forEach((count, c) => {
    const w = inv[c]! / total;
    let y = 0;
    for (let r = 0; r < count; r++) {
      const h = 1 / aspects[k + r]! / sums[c]!;
      rects.push({ x, y, w, h });
      y += h;
    }
    k += count;
    x += w;
  });
  return { id, rects };
}

/** All compositions of n into up to `maxParts` ordered parts (e.g. 3 → [3],[1,2],[2,1],[1,1,1]). */
function compositions(n: number, maxParts: number): number[][] {
  const out: number[][] = [];
  const walk = (remaining: number, acc: number[]) => {
    if (remaining === 0) {
      out.push([...acc]);
      return;
    }
    if (acc.length >= maxParts) return;
    for (let k = Math.min(remaining, 4); k >= 1; k--) walk(remaining - k, [...acc, k]);
  };
  walk(n, []);
  return out;
}

export function candidatesFor(n: number, mode: WallMode, hasPrimary: boolean, aspects: number[] = [], wallAspect?: number): Candidate[] {
  if (n <= 0) return [];
  if (n === 1 || mode === "focus") return [{ id: "single", rects: [{ x: 0, y: 0, w: 1, h: 1 }] }];
  const out: Candidate[] = [];
  const wantGrid = mode === "auto" || mode === "grid";
  const wantPrimary = mode === "auto" || mode === "primary";
  const mixed = aspects.length === n && new Set(aspects.map((a) => a.toFixed(2))).size > 1;
  if (wantGrid) {
    for (const comp of compositions(n, 3)) {
      // Prefer balanced compositions; skip rows with more than 4 tiles.
      if (comp.some((k) => k > 4)) continue;
      out.push(rowsLayout(comp, `rows:${comp.join("-")}`));
      if (comp.length > 1 || comp[0] !== n) out.push(colsLayout(comp, `cols:${comp.join("-")}`));
      if (mixed) {
        out.push(weightedRows(comp, aspects, `wrows:${comp.join("-")}`));
        out.push(weightedCols(comp, aspects, `wcols:${comp.join("-")}`));
      }
    }
  }
  // Without an explicit primary, "primary + supporting" only makes sense for 3+ players.
  if (wantPrimary && (hasPrimary ? n >= 2 : n >= 3)) {
    for (const frac of [0.6, 0.68, 0.75]) {
      out.push(primaryLeft(n, frac, `pl:${frac}`));
      out.push(primaryTop(n, frac, `pt:${frac}`));
      if (n >= 4) out.push(primaryLeftGrid(n, frac, `plg:${frac}`));
    }
    // Primary sized to its own aspect (a portrait primary gets a portrait column).
    if (wallAspect && aspects[0]) {
      const fitFrac = Math.min(0.75, Math.max(0.28, aspects[0] / wallAspect));
      if (fitFrac < 0.58) {
        const f = Number(fitFrac.toFixed(3));
        out.push(primaryLeft(n, f, `pla:${f}`));
        if (n >= 3) out.push(primaryLeftGrid(n, f, `plga:${f}`));
      }
    }
  }
  // Dedupe by geometry: e.g. rows:[1,1] and cols:[2] are the same stacked arrangement.
  const seen = new Set<string>();
  return out.filter((c) => {
    const sig = c.rects.map((r) => [r.x, r.y, r.w, r.h].map((v) => v.toFixed(3)).join(",")).join("|");
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
}

// --------------------------------------------------------------------- scoring

/**
 * Order players into a candidate: the primary (or focus) player takes the
 * first rect, the rest keep wall order.
 */
function orderPlayers(players: readonly LayoutPlayer[], leadIndex: number | null): LayoutPlayer[] {
  if (leadIndex == null) return [...players];
  const lead = players.find((p) => p.index === leadIndex);
  if (!lead) return [...players];
  return [lead, ...players.filter((p) => p.index !== leadIndex)];
}

export function optimizeLayout(input: LayoutInput): LayoutResult {
  const { width, height } = input;
  const gap = input.gap ?? 4;
  const fit = input.fit ?? "smart";
  const minTile = input.minTile ?? { width: 160, height: 90 };
  const players = input.players;
  const n = players.length;
  if (n === 0 || width <= 0 || height <= 0) return { id: "empty", tiles: [], score: 0, coverage: 0 };

  const lead = input.mode === "focus" ? (input.focusIndex ?? input.primaryIndex ?? players[0]!.index) : input.primaryIndex;
  const ordered = input.mode === "focus" ? orderPlayers(players, lead).slice(0, 1) : orderPlayers(players, lead);
  const candidates = candidatesFor(ordered.length, input.mode, input.primaryIndex != null, ordered.map((p) => p.aspect ?? DEFAULT_ASPECT), width / height);
  const viewportArea = width * height;
  // A tile far below an equal share reads as an inexplicable sliver on a real wall.
  const tinyArea = (input.primaryIndex != null ? 0.12 : 0.25) * (viewportArea / ordered.length);

  let best: LayoutResult | null = null;
  for (const cand of candidates) {
    if (cand.rects.length !== ordered.length) continue;
    let effective = 0;
    let penalty = 0;
    let primaryArea = 0;
    let smallest = Infinity;
    let largest = 0;
    const tiles: Tile[] = cand.rects.map((r, i) => {
      const p = ordered[i]!;
      const x = Math.round(r.x * width + (r.x > 0 ? gap / 2 : 0));
      const y = Math.round(r.y * height + (r.y > 0 ? gap / 2 : 0));
      const right = Math.round((r.x + r.w) * width - (r.x + r.w < 0.999 ? gap / 2 : 0));
      const bottom = Math.round((r.y + r.h) * height - (r.y + r.h < 0.999 ? gap / 2 : 0));
      const w = Math.max(1, right - x);
      const h = Math.max(1, bottom - y);
      const aspect = p.aspect ?? DEFAULT_ASPECT;
      const tileAspect = w / h;
      const crop = cropFraction(tileAspect, aspect);
      const tileArea = w * h;
      const covered = fit === "fill" || (fit === "smart" && crop <= SMART_FILL_MAX_CROP);
      // Covered tiles show the whole tile but lose `crop` of the source; letterboxed tiles show less area.
      const shown = covered ? tileArea * (1 - 0.6 * crop) : fitArea(w, h, aspect);
      effective += shown;
      if (w < minTile.width || h < minTile.height) penalty += 0.25;
      if (ordered.length > 1 && tileArea < tinyArea) penalty += 0.2;
      if (tileAspect > 3.2 || tileAspect < 0.3) penalty += 0.08;
      // Primary share counts displayed video, so a letterboxed portrait primary earns no bonus.
      if (input.primaryIndex != null && p.index === input.primaryIndex) primaryArea = shown;
      smallest = Math.min(smallest, tileArea);
      largest = Math.max(largest, tileArea);
      return { index: p.index, x, y, width: w, height: h };
    });
    const coverage = effective / viewportArea;
    // Without a primary, players are peers: strongly unequal tiles need a real coverage win.
    if (input.primaryIndex == null && ordered.length > 1 && largest > 0) penalty += 0.12 * (1 - smallest / largest);
    let score = coverage - penalty;
    if (input.primaryIndex != null && input.mode !== "focus") {
      const share = primaryArea / viewportArea;
      // Reward a dominant primary without starving the rest. The target is relative to
      // what the source can show at full height (a portrait primary can never reach 55%).
      const reachable = Math.min(1, (ordered[0]!.aspect ?? DEFAULT_ASPECT) / (width / height));
      const target = Math.min(0.6, 0.9 * reachable);
      score += 0.35 * Math.min(share, target) - (share < 0.66 * target ? 0.15 : 0);
    }
    // No explicit primary: asymmetric arrangements need a clear coverage win to be chosen.
    if (input.primaryIndex == null && /^(pl|pt|plg|pla|plga):/.test(cand.id)) score -= 0.12;
    // Deterministic tie-break: side-by-side on landscape walls, stacked on portrait walls.
    if (cand.id.startsWith(width >= height ? "rows:" : "cols:")) score += 0.001;
    if (input.previousId && cand.id === input.previousId) score += 0.03;
    const result: LayoutResult = { id: cand.id, tiles, score, coverage };
    if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) <= 1e-9 && cand.id < best.id)) best = result;
  }
  return best ?? { id: "empty", tiles: [], score: 0, coverage: 0 };
}
