import { parseVdf, vdfObject, vdfString } from "./vdf";

/** Raw data returned by the native layer (see src-tauri/src/steam.rs). */
export interface RawManifest {
  fileName: string;
  content: string;
}
export interface RawLibrary {
  path: string;
  exists: boolean;
  manifests: RawManifest[];
}
export interface SteamRaw {
  steamPath: string | null;
  libraryfoldersVdf: string | null;
  libraries: RawLibrary[];
  artworkCacheDir: string | null;
}

/** Steam's StateFlags bitmask (appmanifest). 4 = FullyInstalled. */
export const STATE_FULLY_INSTALLED = 4;
export const STATE_UPDATE_REQUIRED = 2;
export const STATE_UNINSTALLING = 8;
export const STATE_UPDATE_RUNNING = 1024;

export interface InstalledGame {
  appId: number;
  name: string;
  installDir: string;
  /** Absolute path to the install folder (library/steamapps/common/<installdir>). */
  installPath: string;
  libraryPath: string;
  sizeOnDisk: number | null;
  lastUpdated: number | null;
  stateFlags: number;
  fullyInstalled: boolean;
  /** Playtime/last-played are not in manifests; enriched later via Web API. */
}

export interface SteamLibraryInfo {
  path: string;
  exists: boolean;
  gameCount: number;
}

export interface SteamDiscovery {
  detected: boolean;
  steamPath: string | null;
  libraries: SteamLibraryInfo[];
  games: InstalledGame[];
  /** Manifests that failed to parse (file names only). */
  malformed: string[];
  artworkCacheDir: string | null;
}

function joinWin(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .map((p, i) => (i === 0 ? p.replace(/[\\/]+$/, "") : p.replace(/^[\\/]+|[\\/]+$/g, "")))
    .join("\\");
}

/** Parse a single appmanifest_*.acf. Returns null if essential fields are missing. */
export function parseManifest(content: string, libraryPath: string): InstalledGame | null {
  let root;
  try {
    root = parseVdf(content);
  } catch {
    return null;
  }
  const app = vdfObject(root, "AppState");
  if (!app) return null;
  const appId = Number(vdfString(app, "appid"));
  const name = vdfString(app, "name")?.trim();
  const installDir = vdfString(app, "installdir")?.trim();
  if (!Number.isFinite(appId) || appId <= 0 || !name || !installDir) return null;
  const stateFlags = Number(vdfString(app, "StateFlags") ?? "0") || 0;
  const size = Number(vdfString(app, "SizeOnDisk"));
  const updated = Number(vdfString(app, "LastUpdated"));
  return {
    appId,
    name,
    installDir,
    installPath: joinWin(libraryPath, "steamapps", "common", installDir),
    libraryPath,
    sizeOnDisk: Number.isFinite(size) && size > 0 ? size : null,
    lastUpdated: Number.isFinite(updated) && updated > 0 ? updated * 1000 : null,
    stateFlags,
    fullyInstalled: (stateFlags & STATE_FULLY_INSTALLED) !== 0 && (stateFlags & STATE_UNINSTALLING) === 0,
  };
}

/** Library paths listed in libraryfolders.vdf (both modern and legacy formats). */
export function parseLibraryFolders(vdf: string): string[] {
  const root = parseVdf(vdf);
  const lf = vdfObject(root, "libraryfolders") ?? vdfObject(root, "LibraryFolders") ?? root;
  const out: string[] = [];
  for (const [k, v] of Object.entries(lf)) {
    if (!/^\d+$/.test(k)) continue;
    if (typeof v === "string") out.push(v); // legacy: "1" "D:\\Games"
    else {
      const p = vdfString(v, "path");
      if (p) out.push(p);
    }
  }
  return out;
}

/**
 * Build the typed discovery result from raw native data. Deduplicates app ids
 * across libraries (first fully-installed wins) and tolerates malformed files.
 */
export function buildDiscovery(raw: SteamRaw): SteamDiscovery {
  if (!raw.steamPath) {
    return { detected: false, steamPath: null, libraries: [], games: [], malformed: [], artworkCacheDir: null };
  }
  const games = new Map<number, InstalledGame>();
  const malformed: string[] = [];
  const libraries: SteamLibraryInfo[] = [];

  for (const lib of raw.libraries) {
    let count = 0;
    for (const m of lib.manifests) {
      const g = parseManifest(m.content, lib.path);
      if (!g) {
        malformed.push(m.fileName);
        continue;
      }
      count++;
      const existing = games.get(g.appId);
      if (!existing || (!existing.fullyInstalled && g.fullyInstalled)) games.set(g.appId, g);
    }
    libraries.push({ path: lib.path, exists: lib.exists, gameCount: count });
  }

  return {
    detected: true,
    steamPath: raw.steamPath,
    libraries,
    games: [...games.values()].sort((a, b) => a.name.localeCompare(b.name)),
    malformed,
    artworkCacheDir: raw.artworkCacheDir,
  };
}
