//! Steam discovery — bounded, read-only, no drive crawling.
//!
//! Locates Steam via the registry, then reads ONLY:
//!   <steam>/steamapps/libraryfolders.vdf
//!   <library>/steamapps/appmanifest_*.acf   (for each listed library)
//! Raw file contents are returned to the frontend, which owns the (fully
//! tested) VDF/ACF parsing. Launching maps a numeric app id to steam://.

use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RawManifest {
    pub file_name: String,
    pub content: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RawLibrary {
    pub path: String,
    pub exists: bool,
    pub manifests: Vec<RawManifest>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SteamRaw {
    pub steam_path: Option<String>,
    pub libraryfolders_vdf: Option<String>,
    pub libraries: Vec<RawLibrary>,
    pub artwork_cache_dir: Option<String>,
}

/// Registry lookup: HKCU\Software\Valve\Steam\SteamPath, then HKLM fallbacks.
#[cfg(target_os = "windows")]
pub fn locate_steam() -> Option<PathBuf> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;
    let candidates: [(winreg::HKEY, &str, &str); 3] = [
        (HKEY_CURRENT_USER, r"Software\Valve\Steam", "SteamPath"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Valve\Steam", "InstallPath"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Valve\Steam", "InstallPath"),
    ];
    for (root, key, value) in candidates {
        if let Ok(k) = RegKey::predef(root).open_subkey_with_flags(key, KEY_READ) {
            if let Ok(v) = k.get_value::<String, _>(value) {
                let p = PathBuf::from(v.replace('/', "\\"));
                if p.join("steam.exe").exists() || p.join("steamapps").exists() {
                    return Some(p);
                }
            }
        }
    }
    None
}

#[cfg(not(target_os = "windows"))]
pub fn locate_steam() -> Option<PathBuf> {
    None
}

/// Very small extraction of `"path" "X:\\Games"` entries from libraryfolders.vdf.
/// Full parsing happens in the frontend; here we only need candidate directories
/// to read manifests from, and we validate each one exists.
pub fn library_paths_from_vdf(vdf: &str, steam_root: &Path) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = vec![steam_root.to_path_buf()];
    for line in vdf.lines() {
        let t = line.trim();
        if !t.starts_with("\"path\"") {
            continue;
        }
        // "path"		"D:\\SteamLibrary"
        let mut parts = t.splitn(2, char::is_whitespace);
        let _ = parts.next();
        if let Some(rest) = parts.next() {
            let v = rest.trim().trim_matches('"').replace("\\\\", "\\");
            if !v.is_empty() {
                let p = PathBuf::from(v);
                if !out.iter().any(|e| same_path(e, &p)) {
                    out.push(p);
                }
            }
        }
    }
    out
}

fn same_path(a: &Path, b: &Path) -> bool {
    a.to_string_lossy().trim_end_matches('\\').eq_ignore_ascii_case(b.to_string_lossy().trim_end_matches('\\'))
}

pub fn read_library(path: &Path) -> RawLibrary {
    let steamapps = path.join("steamapps");
    let exists = steamapps.is_dir();
    let mut manifests = Vec::new();
    if exists {
        if let Ok(rd) = std::fs::read_dir(&steamapps) {
            for e in rd.flatten() {
                let p = e.path();
                let Some(name) = p.file_name().and_then(|n| n.to_str()) else { continue };
                if name.starts_with("appmanifest_") && name.ends_with(".acf") && p.is_file() {
                    // Manifests are small text files; cap at 256 KB defensively.
                    if let Ok(meta) = p.metadata() {
                        if meta.len() > 256 * 1024 {
                            continue;
                        }
                    }
                    if let Ok(content) = std::fs::read_to_string(&p) {
                        manifests.push(RawManifest { file_name: name.to_string(), content });
                    }
                }
            }
        }
    }
    RawLibrary { path: path.to_string_lossy().to_string(), exists, manifests }
}

pub fn discover() -> SteamRaw {
    let Some(root) = locate_steam() else {
        return SteamRaw { steam_path: None, libraryfolders_vdf: None, libraries: vec![], artwork_cache_dir: None };
    };
    let vdf_path = root.join("steamapps").join("libraryfolders.vdf");
    let vdf = std::fs::read_to_string(&vdf_path).ok();
    let libs = match &vdf {
        Some(v) => library_paths_from_vdf(v, &root),
        None => vec![root.clone()],
    };
    let libraries = libs.iter().map(|p| read_library(p)).collect();
    let cache = root.join("appcache").join("librarycache");
    SteamRaw {
        steam_path: Some(root.to_string_lossy().to_string()),
        libraryfolders_vdf: vdf,
        libraries,
        artwork_cache_dir: if cache.is_dir() { Some(cache.to_string_lossy().to_string()) } else { None },
    }
}

#[tauri::command]
pub fn steam_discover(app: tauri::AppHandle) -> Result<SteamRaw, String> {
    let raw = discover();
    // Allow the WebView to load Steam's local artwork cache (images only, one dir).
    if let Some(cache) = &raw.artwork_cache_dir {
        let _ = tauri::Manager::asset_protocol_scope(&app).allow_directory(Path::new(cache), false);
    }
    Ok(raw)
}

/// Local artwork candidates for an app id from Steam's librarycache.
#[tauri::command]
pub fn steam_local_artwork(app_id: u32) -> Result<Vec<(String, String)>, String> {
    let Some(root) = locate_steam() else { return Ok(vec![]) };
    let cache = root.join("appcache").join("librarycache");
    let mut out = Vec::new();
    for (kind, suffix) in [("cover", "library_600x900.jpg"), ("hero", "library_hero.jpg"), ("header", "header.jpg"), ("icon", "icon.jpg")] {
        // Newer Steam clients nest per-app folders; older ones use flat files.
        let flat = cache.join(format!("{app_id}_{suffix}"));
        let nested = cache.join(app_id.to_string()).join(suffix);
        for p in [flat, nested] {
            if p.is_file() {
                out.push((kind.to_string(), p.to_string_lossy().to_string()));
                break;
            }
        }
    }
    Ok(out)
}

/// Launch via the Steam URL protocol. Only a numeric app id is accepted — the
/// frontend passes ids it discovered; no paths or free text ever reach here.
#[tauri::command]
pub fn steam_launch(app_id: u32) -> Result<(), String> {
    if app_id == 0 {
        return Err("invalid app id".into());
    }
    let url = format!("steam://rungameid/{app_id}");
    crate::system::open_url(&url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_library_paths_and_dedupes_root() {
        let vdf = r#""libraryfolders"
{
	"0"
	{
		"path"		"C:\\Program Files (x86)\\Steam"
	}
	"1"
	{
		"path"		"D:\\SteamLibrary"
	}
}"#;
        let libs = library_paths_from_vdf(vdf, Path::new(r"C:\Program Files (x86)\Steam"));
        assert_eq!(libs.len(), 2);
        assert_eq!(libs[1], PathBuf::from(r"D:\SteamLibrary"));
    }

    #[test]
    fn reads_manifests_from_fixture_dir() {
        let dir = std::env::temp_dir().join(format!("nexus-steam-fixture-{}", std::process::id()));
        let apps = dir.join("steamapps");
        std::fs::create_dir_all(&apps).unwrap();
        std::fs::write(apps.join("appmanifest_620.acf"), "\"AppState\"\n{\n\t\"appid\"\t\"620\"\n}").unwrap();
        std::fs::write(apps.join("notes.txt"), "ignored").unwrap();
        let lib = read_library(&dir);
        assert!(lib.exists);
        assert_eq!(lib.manifests.len(), 1);
        assert_eq!(lib.manifests[0].file_name, "appmanifest_620.acf");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_library_is_reported_not_fatal() {
        let lib = read_library(Path::new(r"Z:\definitely\missing"));
        assert!(!lib.exists);
        assert!(lib.manifests.is_empty());
    }
}
