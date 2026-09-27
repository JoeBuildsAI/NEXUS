//! Xbox / Microsoft Store PC games — local discovery only.
//!
//! Xbox PC titles (GDK) install under `<drive>:\XboxGames\<Title>\Content\` and
//! ship a `MicrosoftGame.config` manifest. We read that manifest (identity,
//! display name, executable id, logo), derive the package family name and
//! launch through the shell (`shell:AppsFolder\<PFN>!<AppId>`). No scraping,
//! no store account, no achievements/playtime — those need Xbox Live APIs that
//! are not available here and are reported as UNAVAILABLE.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct XboxGame {
    pub id: String,
    pub title: String,
    pub package_family_name: Option<String>,
    pub app_id: String,
    pub install_path: String,
    pub install_size_bytes: Option<u64>,
    /// Data URL of the square logo when readable (small PNG), else null.
    pub logo_data_url: Option<String>,
    pub store_id: Option<String>,
    pub publisher: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct XboxInventory {
    pub xbox_app_installed: bool,
    pub roots: Vec<String>,
    pub games: Vec<XboxGame>,
    /// Capabilities NEXUS can truthfully offer for this provider.
    pub capabilities: XboxCapabilities,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct XboxCapabilities {
    pub discovery: bool,
    pub launch: bool,
    pub artwork: bool,
    pub playtime: bool,
    pub achievements: bool,
    pub reason: String,
}

fn attr(xml: &str, tag: &str, name: &str) -> Option<String> {
    let start = xml.find(&format!("<{tag}"))?;
    let rest = &xml[start..];
    let end = rest.find('>')?;
    let elem = &rest[..end];
    let key = format!("{name}=\"");
    let i = elem.find(&key)? + key.len();
    let j = elem[i..].find('"')? + i;
    Some(elem[i..j].to_string())
}

fn text(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let i = xml.find(&open)? + open.len();
    let j = xml[i..].find(&close)? + i;
    let v = xml[i..j].trim();
    if v.is_empty() { None } else { Some(v.to_string()) }
}

/// Publisher hash used in package family names: first 8 bytes of SHA-256 over
/// the UTF-16LE publisher string, encoded as 13 Crockford base32 chars.
pub fn publisher_hash(publisher: &str) -> String {
    let utf16: Vec<u8> = publisher.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
    let digest = Sha256::digest(&utf16);
    let bytes = &digest[..8];
    const ALPHABET: &[u8] = b"0123456789abcdefghjkmnpqrstvwxyz";
    // 65 bits: 8 bytes + one zero bit, read as 13 × 5-bit groups.
    let mut bits: u128 = 0;
    for b in bytes { bits = (bits << 8) | *b as u128; }
    bits <<= 1;
    let mut out = String::with_capacity(13);
    for i in (0..13).rev() {
        let idx = ((bits >> (i * 5)) & 0x1f) as usize;
        out.push(ALPHABET[idx] as char);
    }
    out
}

pub fn parse_config(xml: &str) -> Option<(String, String, String, Option<String>, Option<String>, Option<String>)> {
    let name = attr(xml, "Identity", "Name")?;
    let publisher = attr(xml, "Identity", "Publisher");
    let display = attr(xml, "ShellVisuals", "DefaultDisplayName").unwrap_or_else(|| name.clone());
    let exe_id = attr(xml, "Executable", "Id").unwrap_or_else(|| "Game".to_string());
    let logo = attr(xml, "ShellVisuals", "Square150x150Logo");
    let store_id = text(xml, "StoreId");
    Some((name, display, exe_id, publisher, logo, store_id))
}

fn dir_size(path: &Path, budget: &mut u32) -> u64 {
    let mut total = 0;
    if *budget == 0 { return 0; }
    if let Ok(rd) = std::fs::read_dir(path) {
        for e in rd.flatten() {
            *budget = budget.saturating_sub(1);
            if *budget == 0 { break; }
            if let Ok(m) = e.metadata() {
                if m.is_dir() { total += dir_size(&e.path(), budget); } else { total += m.len(); }
            }
        }
    }
    total
}

fn logo_data_url(content_dir: &Path, logo: &Option<String>) -> Option<String> {
    let rel = logo.as_ref()?;
    let p = content_dir.join(rel.replace('/', "\\"));
    // GDK often ships scaled variants next to the base name; try base then scale-100/200.
    let candidates = [p.clone(), with_suffix(&p, ".scale-100"), with_suffix(&p, ".scale-200"), with_suffix(&p, ".scale-150")];
    for c in candidates {
        if let Ok(bytes) = std::fs::read(&c) {
            if bytes.len() > 512 * 1024 { continue; }
            if !c.starts_with(content_dir) { continue; }
            return Some(format!("data:image/png;base64,{}", base64_encode(&bytes)));
        }
    }
    None
}
fn with_suffix(p: &Path, suffix: &str) -> PathBuf {
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("png");
    p.with_file_name(format!("{stem}{suffix}.{ext}"))
}
fn base64_encode(bytes: &[u8]) -> String {
    const T: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    out
}

pub fn xbox_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    for letter in b'C'..=b'Z' {
        let p = PathBuf::from(format!("{}:\\XboxGames", letter as char));
        if p.is_dir() { roots.push(p); }
    }
    roots
}

pub fn xbox_app_installed() -> bool {
    std::env::var("LOCALAPPDATA").map(|l| Path::new(&l).join("Packages").join("Microsoft.GamingApp_8wekyb3d8bbwe").is_dir()).unwrap_or(false)
}

pub fn discover(roots: &[PathBuf]) -> Vec<XboxGame> {
    let mut out = Vec::new();
    for root in roots {
        let Ok(rd) = std::fs::read_dir(root) else { continue };
        for e in rd.flatten().take(500) {
            let dir = e.path();
            if !dir.is_dir() { continue; }
            let content = dir.join("Content");
            let cfg = content.join("MicrosoftGame.config");
            let Ok(xml) = std::fs::read_to_string(&cfg) else { continue };
            let Some((name, display, exe_id, publisher, logo, store_id)) = parse_config(&xml) else { continue };
            let pfn = publisher.as_ref().map(|p| format!("{name}_{}", publisher_hash(p)));
            let mut budget = 4000u32;
            let size = dir_size(&content, &mut budget);
            out.push(XboxGame {
                id: format!("xbox:{name}"),
                title: display,
                package_family_name: pfn,
                app_id: exe_id,
                install_path: dir.to_string_lossy().to_string(),
                install_size_bytes: if budget > 0 { Some(size) } else { None },
                logo_data_url: logo_data_url(&content, &logo),
                store_id,
                publisher: publisher.map(|p| p.split(',').next().unwrap_or("").trim_start_matches("CN=").to_string()),
            });
        }
    }
    out.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    out
}

#[tauri::command]
pub fn xbox_inventory() -> XboxInventory {
    let roots = xbox_roots();
    let games = discover(&roots);
    XboxInventory {
        xbox_app_installed: xbox_app_installed(),
        roots: roots.iter().map(|r| r.to_string_lossy().to_string()).collect(),
        games,
        capabilities: XboxCapabilities {
            discovery: true,
            launch: true,
            artwork: true,
            playtime: false,
            achievements: false,
            reason: "Playtime and achievements need Xbox Live APIs that NEXUS does not have access to; nothing is invented.".into(),
        },
    }
}

/// Launch through the shell AppsFolder — the same path a Start Menu tile uses.
#[tauri::command]
pub fn xbox_launch(package_family_name: String, app_id: String) -> Result<(), String> {
    if !package_family_name.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-') || package_family_name.len() > 200 {
        return Err("invalid package family name".into());
    }
    if !app_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_') || app_id.is_empty() || app_id.len() > 64 {
        return Err("invalid app id".into());
    }
    let target = format!("shell:AppsFolder\\{package_family_name}!{app_id}");
    std::process::Command::new(r"C:\Windows\explorer.exe").arg(&target).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<Game configVersion="1">
  <Identity Name="Microsoft.SampleGame" Publisher="CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US" Version="1.0.0.0"/>
  <ExecutableList><Executable Name="Sample.exe" Id="Game" TargetDeviceFamily="PC"/></ExecutableList>
  <ShellVisuals DefaultDisplayName="Sample Game" PublisherDisplayName="Sample Studio" Square150x150Logo="Logo150.png" Square44x44Logo="Logo44.png" StoreLogo="StoreLogo.png"/>
  <StoreId>9NBLGGH4R315</StoreId>
</Game>"#;

    #[test]
    fn parses_gdk_manifest() {
        let (name, display, exe, publisher, logo, store) = parse_config(SAMPLE).unwrap();
        assert_eq!(name, "Microsoft.SampleGame");
        assert_eq!(display, "Sample Game");
        assert_eq!(exe, "Game");
        assert!(publisher.unwrap().starts_with("CN=Microsoft"));
        assert_eq!(logo.unwrap(), "Logo150.png");
        assert_eq!(store.unwrap(), "9NBLGGH4R315");
        assert!(parse_config("<Game/>").is_none());
    }

    #[test]
    fn publisher_hash_is_13_crockford_chars_and_matches_known_value() {
        // Microsoft's well-known publisher hash for the Microsoft Corporation certificate.
        let h = publisher_hash("CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US");
        assert_eq!(h.len(), 13);
        assert_eq!(h, "8wekyb3d8bbwe");
    }

    #[test]
    fn launch_rejects_unsafe_identifiers() {
        assert!(xbox_launch("bad name;calc".into(), "Game".into()).is_err());
        assert!(xbox_launch("Ok.Name_1".into(), "Ga me".into()).is_err());
    }

    #[test]
    fn discovers_from_a_synthetic_root() {
        let root = std::env::temp_dir().join(format!("nexus-xbox-{}", std::process::id()));
        let content = root.join("Sample Game").join("Content");
        std::fs::create_dir_all(&content).unwrap();
        std::fs::write(content.join("MicrosoftGame.config"), SAMPLE).unwrap();
        std::fs::write(content.join("Sample.exe"), b"xx").unwrap();
        std::fs::create_dir_all(root.join("NotAGame")).unwrap();
        let games = discover(&[root.clone()]);
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].title, "Sample Game");
        assert_eq!(games[0].package_family_name.as_deref(), Some("Microsoft.SampleGame_8wekyb3d8bbwe"));
        assert_eq!(games[0].install_size_bytes, Some(SAMPLE.len() as u64 + 2));
        let _ = std::fs::remove_dir_all(root);
    }
}
