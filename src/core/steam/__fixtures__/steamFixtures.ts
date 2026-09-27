import type { SteamRaw } from "../discovery";

export const LIBRARYFOLDERS_VDF = `"libraryfolders"
{
	"0"
	{
		"path"		"C:\\\\Program Files (x86)\\\\Steam"
		"label"		""
		"contentid"		"1234"
		"apps"
		{
			"620"		"3200000000"
		}
	}
	"1"
	{
		"path"		"D:\\\\SteamLibrary"
		"label"		"Games"
		"apps"
		{
			"1091500"		"120000000000"
			"1086940"		"148000000000"
		}
	}
}
`;

export const LEGACY_LIBRARYFOLDERS_VDF = `"LibraryFolders"
{
	"TimeNextStatsReport"		"1600000000"
	"ContentStatsID"		"-1"
	"1"		"D:\\\\SteamLibrary"
	"2"		"E:\\\\Games\\\\Steam"
}
`;

export function manifest(appId: number, name: string, installdir: string, opts: { state?: number; size?: number; updated?: number } = {}): string {
  return `"AppState"
{
	"appid"		"${appId}"
	"Universe"		"1"
	"name"		"${name}"
	"StateFlags"		"${opts.state ?? 4}"
	"installdir"		"${installdir}"
	"LastUpdated"		"${opts.updated ?? 1700000000}"
	"SizeOnDisk"		"${opts.size ?? 3200000000}"
	"buildid"		"123456"
	"UserConfig"
	{
		"language"		"english"
	}
}
`;
}

export const MALFORMED_MANIFEST = `"AppState"
{
	"appid"		"999"
	"name"		"Broken
	"StateFlags"
`;

export const NO_APPID_MANIFEST = `"AppState"\n{\n\t"name"\t\t"Nameless"\n\t"installdir"\t\t"Nameless"\n}\n`;

/** Steam installed with a single library. */
export const ONE_LIBRARY: SteamRaw = {
  steamPath: "C:\\Program Files (x86)\\Steam",
  libraryfoldersVdf: `"libraryfolders"\n{\n\t"0"\n\t{\n\t\t"path"\t\t"C:\\\\Program Files (x86)\\\\Steam"\n\t}\n}\n`,
  libraries: [
    {
      path: "C:\\Program Files (x86)\\Steam",
      exists: true,
      manifests: [
        { fileName: "appmanifest_620.acf", content: manifest(620, "Portal 2", "Portal 2") },
        { fileName: "appmanifest_864050.acf", content: manifest(864050, "We Were Here Too", "We Were Here Too") },
      ],
    },
  ],
  artworkCacheDir: "C:\\Program Files (x86)\\Steam\\appcache\\librarycache",
};

/** Steam with multiple libraries incl. a missing one, a malformed manifest, an uninstalling app, and a duplicate. */
export const MULTI_LIBRARY: SteamRaw = {
  steamPath: "C:\\Program Files (x86)\\Steam",
  libraryfoldersVdf: LIBRARYFOLDERS_VDF,
  libraries: [
    {
      path: "C:\\Program Files (x86)\\Steam",
      exists: true,
      manifests: [
        { fileName: "appmanifest_620.acf", content: manifest(620, "Portal 2", "Portal 2") },
        { fileName: "appmanifest_999.acf", content: MALFORMED_MANIFEST },
        { fileName: "appmanifest_1000.acf", content: NO_APPID_MANIFEST },
        // Duplicate of 1091500 that is NOT fully installed (stale/moved) — the D: copy should win.
        { fileName: "appmanifest_1091500.acf", content: manifest(1091500, "Cyberpunk 2077", "Cyberpunk 2077", { state: 2 }) },
      ],
    },
    {
      path: "D:\\SteamLibrary",
      exists: true,
      manifests: [
        { fileName: "appmanifest_1091500.acf", content: manifest(1091500, "Cyberpunk 2077", "Cyberpunk 2077", { size: 120000000000 }) },
        { fileName: "appmanifest_1086940.acf", content: manifest(1086940, "Baldur's Gate 3", "Baldurs Gate 3", { size: 148000000000 }) },
        { fileName: "appmanifest_553850.acf", content: manifest(553850, "HELLDIVERS™ 2", "Helldivers 2", { state: 4 | 8 }) }, // uninstalling
      ],
    },
    { path: "E:\\OldLibrary", exists: false, manifests: [] },
  ],
  artworkCacheDir: null,
};

/** Steam absent. */
export const STEAM_MISSING: SteamRaw = { steamPath: null, libraryfoldersVdf: null, libraries: [], artworkCacheDir: null };

/** 30 installed games across two libraries (perf / rendering fixture). */
export const THIRTY_GAMES: SteamRaw = {
  steamPath: "C:\\Program Files (x86)\\Steam",
  libraryfoldersVdf: LIBRARYFOLDERS_VDF,
  libraries: [
    {
      path: "C:\\Program Files (x86)\\Steam",
      exists: true,
      manifests: Array.from({ length: 15 }, (_, i) => ({ fileName: `appmanifest_${1000 + i}.acf`, content: manifest(1000 + i, `Game ${i + 1}`, `Game${i + 1}`, { size: (i + 1) * 1e9 }) })),
    },
    {
      path: "D:\\SteamLibrary",
      exists: true,
      manifests: Array.from({ length: 15 }, (_, i) => ({ fileName: `appmanifest_${2000 + i}.acf`, content: manifest(2000 + i, `Big Game ${i + 1}`, `BigGame${i + 1}`, { size: (i + 10) * 5e9 }) })),
    },
  ],
  artworkCacheDir: null,
};
