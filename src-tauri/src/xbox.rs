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

/// First element named exactly `tag` (so `<Executable` never matches
/// `<ExecutableList>`); attributes may span lines.
fn element<'a>(xml: &'a str, tag: &str) -> Option<&'a str> {
    let open = format!("<{tag}");
    let mut from = 0;
    while let Some(pos) = xml[from..].find(&open) {
        let start = from + pos;
        let after = xml[start + open.len()..].chars().next()?;
        if after.is_whitespace() || after == '/' || after == '>' {
            let end = xml[start..].find('>')? + start;
            return Some(&xml[start..end]);
        }
        from = start + open.len();
    }
    None
}

fn attr(xml: &str, tag: &str, name: &str) -> Option<String> {
    let elem = element(xml, tag)?;
    let mut from = 0;
    let key = format!("{name}=\"");
    while let Some(pos) = elem[from..].find(&key) {
        let i = from + pos;
        // Whole attribute name only (`Id=` must not match `ResourceId=`).
        if elem[..i].chars().last().map_or(true, |c| c.is_whitespace()) {
            let v = i + key.len();
            let j = elem[v..].find('"')? + v;
            return Some(elem[v..j].to_string());
        }
        from = i + key.len();
    }
    None
}

/// DLC / add-on packages ship their own MicrosoftGame.config under XboxGames
/// but are not launchable games (a real library can hold dozens of content packs).
pub fn is_dlc_config(xml: &str) -> bool {
    xml.contains("<TargetDeviceFamilyForDLC") || element(xml, "MainPackageDependency").is_some() || element(xml, "Executable").is_none()
}

/// The shell AUMID's application id as Windows registered it
/// (`Content\appxmanifest.xml` generated at install), when readable.
fn registered_app_id(content_dir: &Path) -> Option<String> {
    let p = content_dir.join("appxmanifest.xml");
    if std::fs::metadata(&p).ok()?.len() > 1024 * 1024 {
        return None;
    }
    let xml = std::fs::read_to_string(p).ok()?;
    attr(&xml, "Application", "Id").filter(|id| valid_app_id(id))
}

/// Human publisher name: `PublisherDisplayName`, else the certificate CN unless
/// it is an opaque GUID (as some large publishers' packages use).
pub fn publisher_display(xml: &str, cert: Option<&str>) -> Option<String> {
    if let Some(d) = attr(xml, "ShellVisuals", "PublisherDisplayName").map(|s| s.trim().to_string()).filter(|s| !s.is_empty() && !s.starts_with("ms-resource:")) {
        return Some(d);
    }
    let cn = cert?.split(',').next()?.trim().trim_start_matches("CN=").to_string();
    let guid_like = cn.len() == 36 && cn.chars().all(|c| c.is_ascii_hexdigit() || c == '-');
    if cn.is_empty() || guid_like { None } else { Some(cn) }
}

fn valid_app_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_')
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
    // Without an explicit Id, Windows registers the executable's stem (observed:
    // `Name="Minecraft.exe"` → AUMID `…!Minecraft`).
    let exe_id = attr(xml, "Executable", "Id")
        .or_else(|| attr(xml, "Executable", "Name").and_then(|n| Path::new(&n).file_stem().and_then(|s| s.to_str()).map(str::to_string)))
        .filter(|id| valid_app_id(id))
        .unwrap_or_else(|| "Game".to_string());
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
            if is_dlc_config(&xml) { continue; }
            let Some((name, display, exe_id, publisher, logo, store_id)) = parse_config(&xml) else { continue };
            let exe_id = registered_app_id(&content).unwrap_or(exe_id);
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
                publisher: publisher_display(&xml, publisher.as_deref()),
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
    if !valid_app_id(&app_id) {
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

    /// Shape of a real multi-line GDK config: `<ExecutableList>` precedes the
    /// `<Executable Id=…>` and Identity carries `ResourceId`.
    const MULTILINE: &str = "\u{feff}<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<Game\n  configVersion=\"1\">\n  <Identity\n    Name=\"12345Studio.CoreBase\"\n    Publisher=\"CN=07A9AC0F-5502-4D92-BA69-01D5D39D1E92\"\n    Version=\"1.0.215.0\"\n    ResourceId=\"ww\"/>\n  <ExecutableList>\n    <Executable Name=\"bootstrapper.exe\" Id=\"coreShip\" IsDevOnly=\"false\" TargetDeviceFamily=\"PC\" />\n  </ExecutableList>\n  <ShellVisuals\n    DefaultDisplayName=\"Shooter\u{ae}\"\n    Square150x150Logo=\"Square150x150Logo.png\" />\n</Game>";

    const DLC: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<Game configVersion="1">
  <Identity Name="12345Studio.DLC11Pack" Publisher="CN=07A9AC0F-5502-4D92-BA69-01D5D39D1E92" Version="0.0.9.0" />
  <ShellVisuals DefaultDisplayName="DLC11 Pack" Square150x150Logo="media\logos\logo.png" />
  <StoreId>9N7VJK93W35D</StoreId>
  <TargetDeviceFamilyForDLC>PC</TargetDeviceFamilyForDLC>
  <DesktopRegistration><MainPackageDependency Name="12345Studio.CoreBase" /></DesktopRegistration>
</Game>"#;

    #[test]
    fn executable_id_is_not_shadowed_by_executable_list() {
        let (name, display, exe, publisher, _, _) = parse_config(MULTILINE).unwrap();
        assert_eq!(name, "12345Studio.CoreBase");
        assert_eq!(display, "Shooter\u{ae}");
        assert_eq!(exe, "coreShip");
        assert_eq!(publisher_hash(&publisher.unwrap()), "5bkah9njm3e9g", "matches the PFN Windows registered for this publisher");
        assert_eq!(publisher_display(MULTILINE, Some("CN=07A9AC0F-5502-4D92-BA69-01D5D39D1E92")), None, "opaque GUID CN is never shown");
        assert_eq!(publisher_display(SAMPLE, None).as_deref(), Some("Sample Studio"));
        let no_id = SAMPLE.replace(" Id=\"Game\"", "").replace("Sample.exe", "Launcher.exe");
        assert_eq!(parse_config(&no_id).unwrap().2, "Launcher");
    }

    #[test]
    fn dlc_packages_are_not_games() {
        assert!(is_dlc_config(DLC));
        assert!(!is_dlc_config(SAMPLE));
        assert!(!is_dlc_config(MULTILINE));
        let root = std::env::temp_dir().join(format!("nexus-xbox-dlc-{}", std::process::id()));
        for (dir, cfg) in [("Shooter", MULTILINE), ("DLC11 Pack", DLC)] {
            let content = root.join(dir).join("Content");
            std::fs::create_dir_all(&content).unwrap();
            std::fs::write(content.join("MicrosoftGame.config"), cfg).unwrap();
        }
        std::fs::write(root.join("Shooter").join("Content").join("appxmanifest.xml"), r#"<Package><Identity Name="12345Studio.CoreBase" ResourceId="ww"/><Applications><Application Id="coreShipReg" Executable="GameLaunchHelper.exe"/></Applications></Package>"#).unwrap();
        let games = discover(&[root.clone()]);
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].app_id, "coreShipReg", "registered AUMID wins over the config");
        assert_eq!(games[0].package_family_name.as_deref(), Some("12345Studio.CoreBase_5bkah9njm3e9g"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    #[ignore]
    fn print_live_inventory() {
        let inv = xbox_inventory();
        println!("app={} roots={}", inv.xbox_app_installed, inv.roots.len());
        for g in inv.games {
            println!("{} | {:?}!{} | logo={} | size={:?}", g.title, g.package_family_name, g.app_id, g.logo_data_url.is_some(), g.install_size_bytes);
        }
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
