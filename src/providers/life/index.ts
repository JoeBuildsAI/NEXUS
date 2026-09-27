import { config } from "@/core/config";
import { MemoryLifeRepository, type LifeRepository } from "@/core/life/repository";
import { SqliteLifeRepository } from "./SqliteLifeRepository";

let repo: LifeRepository | null = null;

/**
 * PERSONAL data repository: SQLite in the desktop build, key-value memory
 * store in the browser preview (localStorage) and tests.
 */
export function getLifeRepository(): LifeRepository {
  if (repo) return repo;
  repo = config.isTauri ? new SqliteLifeRepository() : new MemoryLifeRepository(typeof localStorage !== "undefined" ? localStorage : null);
  return repo;
}

/** Tests / simulation: swap the repository (e.g. a fresh memory store). */
export function setLifeRepository(r: LifeRepository | null) {
  repo = r;
}

export { SqliteLifeRepository };
