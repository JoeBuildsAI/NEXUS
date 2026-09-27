import { describe, expect, it } from "vitest";
import { parseVdf } from "./vdf";
import { buildDiscovery, parseLibraryFolders, parseManifest } from "./discovery";
import {
  LEGACY_LIBRARYFOLDERS_VDF,
  LIBRARYFOLDERS_VDF,
  MALFORMED_MANIFEST,
  MULTI_LIBRARY,
  ONE_LIBRARY,
  STEAM_MISSING,
  THIRTY_GAMES,
  manifest,
} from "./__fixtures__/steamFixtures";

describe("VDF parser", () => {
  it("parses nested blocks, escapes and comments", () => {
    const v = parseVdf(`// comment\n"root"\n{\n\t"a"\t"1"\n\t"b" { "c" "x\\"y" }\n\tunquoted value\n}`);
    expect(v).toEqual({ root: { a: "1", b: { c: 'x"y' }, unquoted: "value" } });
  });

  it("tolerates truncated input", () => {
    expect(() => parseVdf(MALFORMED_MANIFEST)).not.toThrow();
  });
});

describe("libraryfolders.vdf", () => {
  it("reads modern format paths", () => {
    expect(parseLibraryFolders(LIBRARYFOLDERS_VDF)).toEqual(["C:\\Program Files (x86)\\Steam", "D:\\SteamLibrary"]);
  });
  it("reads legacy format paths", () => {
    expect(parseLibraryFolders(LEGACY_LIBRARYFOLDERS_VDF)).toEqual(["D:\\SteamLibrary", "E:\\Games\\Steam"]);
  });
});

describe("appmanifest parsing", () => {
  it("maps a manifest to an installed game", () => {
    const g = parseManifest(manifest(620, "Portal 2", "Portal 2", { size: 1234, updated: 1700000000 }), "C:\\Steam");
    expect(g).toMatchObject({ appId: 620, name: "Portal 2", installDir: "Portal 2", sizeOnDisk: 1234, fullyInstalled: true });
    expect(g?.installPath).toBe("C:\\Steam\\steamapps\\common\\Portal 2");
    expect(g?.lastUpdated).toBe(1700000000 * 1000);
  });
  it("returns null for malformed or incomplete manifests", () => {
    expect(parseManifest(MALFORMED_MANIFEST, "C:\\Steam")).toBeNull();
    expect(parseManifest("garbage", "C:\\Steam")).toBeNull();
  });
  it("flags uninstalling apps as not fully installed", () => {
    const g = parseManifest(manifest(1, "X", "X", { state: 4 | 8 }), "C:\\Steam");
    expect(g?.fullyInstalled).toBe(false);
  });
});

describe("buildDiscovery", () => {
  it("Steam unavailable → typed not-detected state, never throws", () => {
    const d = buildDiscovery(STEAM_MISSING);
    expect(d.detected).toBe(false);
    expect(d.games).toEqual([]);
  });

  it("one library", () => {
    const d = buildDiscovery(ONE_LIBRARY);
    expect(d.detected).toBe(true);
    expect(d.libraries).toHaveLength(1);
    expect(d.games.map((g) => g.appId).sort()).toEqual([620, 864050]);
  });

  it("multiple libraries: missing library reported, malformed skipped, duplicate resolved, uninstalling flagged", () => {
    const d = buildDiscovery(MULTI_LIBRARY);
    expect(d.libraries.find((l) => l.path === "E:\\OldLibrary")?.exists).toBe(false);
    expect(d.malformed).toEqual(["appmanifest_999.acf", "appmanifest_1000.acf"]);
    const cp = d.games.find((g) => g.appId === 1091500)!;
    expect(cp.libraryPath).toBe("D:\\SteamLibrary"); // fully-installed copy wins
    expect(cp.fullyInstalled).toBe(true);
    expect(d.games.filter((g) => g.appId === 1091500)).toHaveLength(1);
    expect(d.games.find((g) => g.appId === 553850)?.fullyInstalled).toBe(false);
    expect(d.games.map((g) => g.appId)).toHaveLength(4);
  });

  it("handles 30 games across libraries", () => {
    const d = buildDiscovery(THIRTY_GAMES);
    expect(d.games).toHaveLength(30);
    expect(d.libraries.reduce((n, l) => n + l.gameCount, 0)).toBe(30);
  });
});
