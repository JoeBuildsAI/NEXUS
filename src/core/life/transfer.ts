import { LIFE_COLLECTIONS, type Entity, type LifeCollection } from "./models";
import { emptyDump, type LifeDump } from "./repository";

/**
 * Privacy-safe LIFE export/import. Versioned JSON containing PERSONAL data only:
 * routines, workouts + history, foods, meals, plan, groceries, pantry, local
 * calendar events, tasks and non-secret KV (targets). Never tokens,
 * credentials, email, media paths or caches. External-provider events are
 * excluded (they belong to the provider).
 */
export const LIFE_EXPORT_FORMAT = "nexus-life";
export const LIFE_EXPORT_VERSION = 1;

export interface LifeExport {
  format: typeof LIFE_EXPORT_FORMAT;
  version: number;
  exportedAt: number;
  app: string;
  counts: Partial<Record<LifeCollection, number>>;
  data: LifeDump;
}

const FORBIDDEN_KEY = /(token|secret|password|credential|apikey|api_key)/i;

export function createLifeExport(dump: LifeDump, appVersion: string, opts: { includeDemo?: boolean } = {}): LifeExport {
  const data = emptyDump();
  const counts: Partial<Record<LifeCollection, number>> = {};
  for (const c of LIFE_COLLECTIONS) {
    let rows = (dump[c] as Entity[]).filter((r) => !r.deletedAt && (opts.includeDemo || !r.demo));
    if (c === "events") rows = rows.filter((r) => (r as unknown as { source?: string }).source === "local");
    (data as unknown as Record<string, Entity[]>)[c] = rows.map(scrub);
    counts[c] = rows.length;
  }
  data.kv = Object.fromEntries(Object.entries(dump.kv ?? {}).filter(([k]) => !FORBIDDEN_KEY.test(k)));
  return { format: LIFE_EXPORT_FORMAT, version: LIFE_EXPORT_VERSION, exportedAt: Date.now(), app: appVersion, counts, data };
}

function scrub<T extends object>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (!FORBIDDEN_KEY.test(k)) out[k] = v;
  return out as T;
}

export interface ImportValidation {
  ok: boolean;
  error?: string;
  counts: Partial<Record<LifeCollection, number>>;
  dump?: LifeDump;
  warnings: string[];
}

const MAX_ROWS = 500_000;

/** Validate untrusted JSON before it can touch the database. */
export function validateLifeImport(payload: unknown): ImportValidation {
  const warnings: string[] = [];
  const bad = (error: string): ImportValidation => ({ ok: false, error, counts: {}, warnings });
  if (!payload || typeof payload !== "object") return bad("Not a NEXUS export.");
  const p = payload as Partial<LifeExport>;
  if (p.format !== LIFE_EXPORT_FORMAT) return bad("Unrecognized file format.");
  if (typeof p.version !== "number" || p.version < 1 || p.version > LIFE_EXPORT_VERSION) return bad(`Unsupported export version ${String(p.version)}.`);
  if (!p.data || typeof p.data !== "object") return bad("Export contains no data.");
  const src = p.data as unknown as Record<string, unknown>;
  const dump = emptyDump();
  const counts: Partial<Record<LifeCollection, number>> = {};
  let total = 0;
  for (const c of LIFE_COLLECTIONS) {
    const rows = src[c];
    if (rows == null) continue;
    if (!Array.isArray(rows)) return bad(`"${c}" is not a list.`);
    const valid: Entity[] = [];
    for (const r of rows) {
      if (!r || typeof r !== "object") continue;
      const e = r as Record<string, unknown>;
      if (typeof e.id !== "string" || typeof e.updatedAt !== "number" || typeof e.createdAt !== "number") { warnings.push(`Skipped a ${c} row without id/timestamps.`); continue; }
      if (Object.keys(e).some((k) => FORBIDDEN_KEY.test(k))) { warnings.push(`Removed a sensitive field from ${c}.`); }
      const clean = scrub(e);
      valid.push({ ...clean, rev: typeof e.rev === "number" ? e.rev : 1, deletedAt: null } as unknown as Entity);
    }
    total += valid.length;
    if (total > MAX_ROWS) return bad("Export is too large.");
    (dump as unknown as Record<string, Entity[]>)[c] = valid;
    counts[c] = valid.length;
  }
  const kv = src.kv;
  if (kv && typeof kv === "object" && !Array.isArray(kv)) dump.kv = Object.fromEntries(Object.entries(kv as Record<string, unknown>).filter(([k]) => !FORBIDDEN_KEY.test(k)));
  return { ok: true, counts, dump, warnings: [...new Set(warnings)].slice(0, 10) };
}
