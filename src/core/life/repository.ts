import { LIFE_COLLECTIONS, type Entity, type LifeCollection, type LifeEntityMap } from "./models";

/**
 * Persistence boundary for PERSONAL data. Implementations: SQLite (desktop,
 * app layer) and a key-value–backed memory repository (browser preview,
 * tests, and a base for future mobile storage). The domain never touches
 * storage directly; stores load through this interface.
 */
export interface DayRange {
  from: string;
  to: string;
}

export interface LoadOptions {
  /** Restrict to rows whose indexed day (see dayOf) is within the range. */
  days?: DayRange;
  includeDeleted?: boolean;
  limit?: number;
}

export interface LifeRepository {
  readonly kind: "sqlite" | "memory";
  ready(): Promise<void>;
  load<K extends LifeCollection>(collection: K, opts?: LoadOptions): Promise<LifeEntityMap[K][]>;
  /** Upsert rows atomically (single transaction). */
  put<K extends LifeCollection>(collection: K, rows: readonly LifeEntityMap[K][]): Promise<void>;
  /** Tombstone (default) or hard-delete rows. */
  remove(collection: LifeCollection, ids: readonly string[], hard?: boolean): Promise<void>;
  counts(): Promise<Record<LifeCollection, number>>;
  /** Remove every row flagged demo across all collections. */
  purgeDemo(): Promise<number>;
  /** Everything (excluding tombstones) for export. */
  dump(): Promise<LifeDump>;
  /** Replace or merge from a dump (already validated). */
  restore(dump: LifeDump, mode: "replace" | "merge"): Promise<void>;
  /** Small non-secret key/value settings (targets, preferences). */
  getKV<T>(key: string): Promise<T | null>;
  setKV<T>(key: string, value: T): Promise<void>;
  /** Wipe all personal data (explicit user action). */
  clearAll(): Promise<void>;
}

export type LifeDump = { [K in LifeCollection]: LifeEntityMap[K][] } & { kv: Record<string, unknown> };

/** The indexed day column for a row (enables ranged loads without scanning everything). */
export function dayOf(collection: LifeCollection, row: Entity): string | null {
  const r = row as unknown as Record<string, unknown>;
  switch (collection) {
    case "events":
    case "routineCompletions":
    case "sessions":
    case "mealPlan":
      return typeof r.day === "string" ? r.day : null;
    case "tasks":
      return typeof r.dueDay === "string" ? r.dueDay : null;
    case "groceries":
      return typeof r.week === "string" ? r.week : null;
    default:
      return null;
  }
}

export function emptyDump(): LifeDump {
  const d = { kv: {} } as LifeDump;
  for (const c of LIFE_COLLECTIONS) (d as unknown as Record<string, unknown[]>)[c] = [];
  return d;
}

/** Minimal key-value storage adapter (localStorage on web, anything on mobile). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Memory repository persisted through a KeyValueStorage adapter. Used by the
 * browser preview and tests; same semantics as SQLite (tombstones, ranged
 * loads, demo purge, dump/restore).
 */
export class MemoryLifeRepository implements LifeRepository {
  readonly kind = "memory" as const;
  private data = new Map<LifeCollection, Map<string, Entity>>();
  private kv = new Map<string, unknown>();
  private loaded = false;

  constructor(private storage: KeyValueStorage | null = null, private prefix = "nexus-life") {}

  async ready() {
    if (this.loaded) return;
    this.loaded = true;
    for (const c of LIFE_COLLECTIONS) {
      const raw = this.storage?.getItem(`${this.prefix}:${c}`);
      const rows = raw ? safeParse<Entity[]>(raw) ?? [] : [];
      this.data.set(c, new Map(rows.filter((r) => r && typeof r.id === "string").map((r) => [r.id, r])));
    }
    const kvRaw = this.storage?.getItem(`${this.prefix}:kv`);
    const kv = kvRaw ? safeParse<Record<string, unknown>>(kvRaw) : null;
    this.kv = new Map(Object.entries(kv ?? {}));
  }
  private table(c: LifeCollection) {
    let t = this.data.get(c);
    if (!t) { t = new Map(); this.data.set(c, t); }
    return t;
  }
  private persist(c: LifeCollection) {
    this.storage?.setItem(`${this.prefix}:${c}`, JSON.stringify([...this.table(c).values()]));
  }
  private persistKV() {
    this.storage?.setItem(`${this.prefix}:kv`, JSON.stringify(Object.fromEntries(this.kv)));
  }

  async load<K extends LifeCollection>(collection: K, opts: LoadOptions = {}): Promise<LifeEntityMap[K][]> {
    await this.ready();
    let rows = [...this.table(collection).values()] as LifeEntityMap[K][];
    if (!opts.includeDeleted) rows = rows.filter((r) => !r.deletedAt);
    if (opts.days) {
      const { from, to } = opts.days;
      rows = rows.filter((r) => { const d = dayOf(collection, r); return d == null || (d >= from && d <= to); });
    }
    if (opts.limit) rows = rows.slice(0, opts.limit);
    return rows;
  }
  async put<K extends LifeCollection>(collection: K, rows: readonly LifeEntityMap[K][]) {
    await this.ready();
    const t = this.table(collection);
    for (const r of rows) t.set(r.id, r);
    this.persist(collection);
  }
  async remove(collection: LifeCollection, ids: readonly string[], hard = false) {
    await this.ready();
    const t = this.table(collection);
    const now = Date.now();
    for (const id of ids) {
      const row = t.get(id);
      if (!row) continue;
      if (hard) t.delete(id);
      else t.set(id, { ...row, deletedAt: now, updatedAt: now, rev: row.rev + 1 });
    }
    this.persist(collection);
  }
  async counts() {
    await this.ready();
    const out = {} as Record<LifeCollection, number>;
    for (const c of LIFE_COLLECTIONS) out[c] = [...this.table(c).values()].filter((r) => !r.deletedAt).length;
    return out;
  }
  async purgeDemo() {
    await this.ready();
    let n = 0;
    for (const c of LIFE_COLLECTIONS) {
      const t = this.table(c);
      for (const [id, r] of t) if (r.demo) { t.delete(id); n++; }
      this.persist(c);
    }
    return n;
  }
  async dump(): Promise<LifeDump> {
    await this.ready();
    const d = emptyDump();
    for (const c of LIFE_COLLECTIONS) (d as unknown as Record<string, Entity[]>)[c] = [...this.table(c).values()].filter((r) => !r.deletedAt);
    d.kv = Object.fromEntries(this.kv);
    return d;
  }
  async restore(dump: LifeDump, mode: "replace" | "merge") {
    await this.ready();
    for (const c of LIFE_COLLECTIONS) {
      const incoming = ((dump as unknown as Record<string, Entity[]>)[c] ?? []) as Entity[];
      const t = mode === "replace" ? new Map<string, Entity>() : this.table(c);
      for (const r of incoming) {
        const cur = t.get(r.id);
        if (!cur || cur.updatedAt <= r.updatedAt) t.set(r.id, r);
      }
      this.data.set(c, t);
      this.persist(c);
    }
    if (mode === "replace") this.kv = new Map(Object.entries(dump.kv ?? {}));
    else for (const [k, v] of Object.entries(dump.kv ?? {})) this.kv.set(k, v);
    this.persistKV();
  }
  async getKV<T>(key: string) {
    await this.ready();
    return (this.kv.get(key) as T | undefined) ?? null;
  }
  async setKV<T>(key: string, value: T) {
    await this.ready();
    this.kv.set(key, value);
    this.persistKV();
  }
  async clearAll() {
    await this.ready();
    for (const c of LIFE_COLLECTIONS) { this.data.set(c, new Map()); this.storage?.removeItem(`${this.prefix}:${c}`); }
    this.kv.clear();
    this.storage?.removeItem(`${this.prefix}:kv`);
  }
}

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
