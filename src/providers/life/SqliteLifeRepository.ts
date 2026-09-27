import Database from "@tauri-apps/plugin-sql";
import { LIFE_COLLECTIONS, type Entity, type LifeCollection, type LifeEntityMap } from "@/core/life/models";
import { dayOf, emptyDump, type LifeDump, type LifeRepository, type LoadOptions } from "@/core/life/repository";
import { createLogger } from "@/lib/logger";

const log = createLogger("life-db");
const DB_URL = "sqlite:life.db";
const CHUNK = 400;

export type IntegrityState = "ok" | "corrupt" | "unknown";

/**
 * SQLite-backed personal data store (desktop). Migrations run natively on
 * load; every multi-row write is one transaction; ranged loads use the
 * (collection, day) index. Rows are JSON documents with indexed columns —
 * referential integrity between collections is enforced by the domain.
 */
export class SqliteLifeRepository implements LifeRepository {
  readonly kind = "sqlite" as const;
  private db: Database | null = null;
  private opening: Promise<void> | null = null;
  integrity: IntegrityState = "unknown";

  async ready(): Promise<void> {
    if (this.db) return;
    if (!this.opening) {
      this.opening = (async () => {
        const db = await Database.load(DB_URL);
        await db.execute("PRAGMA foreign_keys = ON");
        const check = await db.select<{ integrity_check: string }[]>("PRAGMA integrity_check");
        this.integrity = check.length === 1 && check[0]?.integrity_check === "ok" ? "ok" : "corrupt";
        if (this.integrity !== "ok") log.warn("life.db integrity check failed", { rows: check.length });
        this.db = db;
        log.info("life.db ready", { integrity: this.integrity });
      })();
    }
    await this.opening;
  }
  private async conn(): Promise<Database> {
    await this.ready();
    return this.db!;
  }
  /** Close so the file can be quarantined/replaced; reopen lazily. */
  async close(): Promise<void> {
    if (this.db) { await this.db.close().catch(() => undefined); this.db = null; this.opening = null; }
  }

  async load<K extends LifeCollection>(collection: K, opts: LoadOptions = {}): Promise<LifeEntityMap[K][]> {
    const db = await this.conn();
    const where = ["collection = $1"];
    const args: unknown[] = [collection];
    if (!opts.includeDeleted) where.push("deleted_at IS NULL");
    if (opts.days) { where.push(`(day IS NULL OR (day >= $${args.length + 1} AND day <= $${args.length + 2}))`); args.push(opts.days.from, opts.days.to); }
    const sql = `SELECT data FROM life_documents WHERE ${where.join(" AND ")} ORDER BY updated_at DESC${opts.limit ? ` LIMIT ${Math.floor(opts.limit)}` : ""}`;
    const rows = await db.select<{ data: string }[]>(sql, args);
    const out: LifeEntityMap[K][] = [];
    for (const r of rows) { try { out.push(JSON.parse(r.data)); } catch { log.warn("skipping unreadable row", { collection }); } }
    return out;
  }

  async put<K extends LifeCollection>(collection: K, rows: readonly LifeEntityMap[K][]): Promise<void> {
    if (!rows.length) return;
    const db = await this.conn();
    await db.execute("BEGIN");
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const values: string[] = [];
        const args: unknown[] = [];
        for (const r of slice) {
          const base = args.length;
          values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`);
          args.push(collection, r.id, dayOf(collection, r), r.updatedAt, r.deletedAt ?? null, r.rev, r.demo ? 1 : 0, JSON.stringify(r));
        }
        await db.execute(
          `INSERT INTO life_documents (collection, id, day, updated_at, deleted_at, rev, demo, data) VALUES ${values.join(",")}
           ON CONFLICT(collection, id) DO UPDATE SET day = excluded.day, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, rev = excluded.rev, demo = excluded.demo, data = excluded.data`,
          args,
        );
        const changes = slice.map((_r, k) => `($${k * 4 + 1}, $${k * 4 + 2}, $${k * 4 + 3}, $${k * 4 + 4})`).join(",");
        await db.execute(`INSERT INTO life_changes (collection, id, rev, at) VALUES ${changes}`, slice.flatMap((r) => [collection, r.id, r.rev, r.updatedAt]));
      }
      await db.execute("COMMIT");
    } catch (e) {
      await db.execute("ROLLBACK").catch(() => undefined);
      throw e;
    }
  }

  async remove(collection: LifeCollection, ids: readonly string[], hard = false): Promise<void> {
    if (!ids.length) return;
    const db = await this.conn();
    const now = Date.now();
    await db.execute("BEGIN");
    try {
      for (const id of ids) {
        if (hard) await db.execute("DELETE FROM life_documents WHERE collection = $1 AND id = $2", [collection, id]);
        else {
          const rows = await db.select<{ data: string; rev: number }[]>("SELECT data, rev FROM life_documents WHERE collection = $1 AND id = $2", [collection, id]);
          const row = rows[0];
          if (!row) continue;
          const doc = { ...(JSON.parse(row.data) as Entity), deletedAt: now, updatedAt: now, rev: row.rev + 1 };
          await db.execute("UPDATE life_documents SET deleted_at = $3, updated_at = $3, rev = $4, data = $5 WHERE collection = $1 AND id = $2", [collection, id, now, doc.rev, JSON.stringify(doc)]);
          await db.execute("INSERT INTO life_changes (collection, id, rev, at) VALUES ($1, $2, $3, $4)", [collection, id, doc.rev, now]);
        }
      }
      await db.execute("COMMIT");
    } catch (e) {
      await db.execute("ROLLBACK").catch(() => undefined);
      throw e;
    }
  }

  async counts(): Promise<Record<LifeCollection, number>> {
    const db = await this.conn();
    const rows = await db.select<{ collection: LifeCollection; n: number }[]>("SELECT collection, COUNT(*) AS n FROM life_documents WHERE deleted_at IS NULL GROUP BY collection");
    const out = {} as Record<LifeCollection, number>;
    for (const c of LIFE_COLLECTIONS) out[c] = 0;
    for (const r of rows) if (r.collection in out) out[r.collection] = Number(r.n);
    return out;
  }

  async purgeDemo(): Promise<number> {
    const db = await this.conn();
    const r = await db.execute("DELETE FROM life_documents WHERE demo = 1");
    return r.rowsAffected;
  }

  async dump(): Promise<LifeDump> {
    const d = emptyDump();
    for (const c of LIFE_COLLECTIONS) (d as unknown as Record<string, Entity[]>)[c] = await this.load(c);
    const db = await this.conn();
    const kv = await db.select<{ key: string; value: string }[]>("SELECT key, value FROM life_kv");
    d.kv = Object.fromEntries(kv.map((r) => [r.key, safeJson(r.value)]));
    return d;
  }

  async restore(dump: LifeDump, mode: "replace" | "merge"): Promise<void> {
    const db = await this.conn();
    await db.execute("BEGIN");
    try {
      if (mode === "replace") { await db.execute("DELETE FROM life_documents"); await db.execute("DELETE FROM life_kv"); }
      await db.execute("COMMIT");
    } catch (e) {
      await db.execute("ROLLBACK").catch(() => undefined);
      throw e;
    }
    for (const c of LIFE_COLLECTIONS) {
      const rows = ((dump as unknown as Record<string, Entity[]>)[c] ?? []) as Entity[];
      if (mode === "merge") {
        const existing = new Map((await this.load(c, { includeDeleted: true })).map((r) => [r.id, r]));
        await this.put(c, rows.filter((r) => { const cur = existing.get(r.id); return !cur || cur.updatedAt <= r.updatedAt; }) as LifeEntityMap[typeof c][]);
      } else await this.put(c, rows as LifeEntityMap[typeof c][]);
    }
    for (const [k, v] of Object.entries(dump.kv ?? {})) await this.setKV(k, v);
  }

  async getKV<T>(key: string): Promise<T | null> {
    const db = await this.conn();
    const rows = await db.select<{ value: string }[]>("SELECT value FROM life_kv WHERE key = $1", [key]);
    return rows[0] ? (safeJson(rows[0].value) as T) : null;
  }
  async setKV<T>(key: string, value: T): Promise<void> {
    const db = await this.conn();
    await db.execute("INSERT INTO life_kv (key, value, updated_at) VALUES ($1, $2, $3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", [key, JSON.stringify(value), Date.now()]);
  }

  async clearAll(): Promise<void> {
    const db = await this.conn();
    await db.execute("BEGIN");
    try {
      await db.execute("DELETE FROM life_documents");
      await db.execute("DELETE FROM life_kv");
      await db.execute("DELETE FROM life_changes");
      await db.execute("COMMIT");
    } catch (e) {
      await db.execute("ROLLBACK").catch(() => undefined);
      throw e;
    }
  }

  // ---------------------------------------------------------------- backups
  /** Consistent snapshot via VACUUM INTO (WAL-safe), to a native-chosen path. */
  async backupTo(path: string): Promise<void> {
    const db = await this.conn();
    await db.execute(`VACUUM INTO '${path.replace(/'/g, "''")}'`);
    log.info("life.db backup written");
  }
  /** Integrity-check a backup file before restoring by attaching it. */
  async restoreFromFile(path: string): Promise<{ ok: boolean; error?: string; rows?: number }> {
    const db = await this.conn();
    const p = path.replace(/'/g, "''");
    try {
      await db.execute(`ATTACH DATABASE '${p}' AS bk`);
      const check = await db.select<{ integrity_check: string }[]>("PRAGMA bk.integrity_check");
      if (!(check.length === 1 && check[0]?.integrity_check === "ok")) { await db.execute("DETACH DATABASE bk"); return { ok: false, error: "The backup failed its integrity check." }; }
      const tables = await db.select<{ name: string }[]>("SELECT name FROM bk.sqlite_master WHERE type = 'table' AND name = 'life_documents'");
      if (!tables.length) { await db.execute("DETACH DATABASE bk"); return { ok: false, error: "The backup does not contain NEXUS life data." }; }
      await db.execute("BEGIN");
      await db.execute("DELETE FROM life_documents");
      await db.execute("INSERT INTO life_documents SELECT * FROM bk.life_documents");
      const hasKv = await db.select<{ name: string }[]>("SELECT name FROM bk.sqlite_master WHERE type = 'table' AND name = 'life_kv'");
      if (hasKv.length) { await db.execute("DELETE FROM life_kv"); await db.execute("INSERT INTO life_kv SELECT * FROM bk.life_kv"); }
      await db.execute("COMMIT");
      const n = await db.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM life_documents");
      await db.execute("DETACH DATABASE bk");
      log.info("life.db restored from backup", { rows: Number(n[0]?.n ?? 0) });
      return { ok: true, rows: Number(n[0]?.n ?? 0) };
    } catch (e) {
      await db.execute("ROLLBACK").catch(() => undefined);
      await db.execute("DETACH DATABASE bk").catch(() => undefined);
      return { ok: false, error: String((e as Error)?.message ?? e).slice(0, 160) };
    }
  }
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
