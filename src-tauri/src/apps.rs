//! Windows application discovery. Sources are curated, small and installer-
//! maintained — never a disk crawl:
//!   1. Start Menu shortcuts (all users + current user), resolved to their
//!      target executable so duplicates collapse and helpers can be filtered
//!   2. HKLM/HKCU `App Paths` registrations
//!   3. A short list of Windows built-ins
//! Launch is id-gated against this registry; the frontend never passes a path.

use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Discovered application. `id` is a stable hash of the launch path.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppEntry {
    id: String,
    name: String,
    path: String,
    source: String,
    /// Resolved executable (for shortcuts) — used for dedupe + icons; may equal `path`.
    target: String,
    /// Higher = more likely something a person launches on purpose.
    rank: u8,
}

/// Registry of discovered apps. Launch requests are validated against this.
pub struct AppRegistry {
    pub apps: Mutex<HashMap<String, AppEntry>>,
}

impl AppRegistry {
    pub fn new() -> Self {
        Self { apps: Mutex::new(HashMap::new()) }
    }
}

pub fn stable_id(path: &str) -> String {
    // FNV-1a 64 — stable across runs, no extra deps.
    let mut h: u64 = 0xcbf29ce484222325;
    for b in path.to_lowercase().bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("app-{h:016x}")
}

const SKIP_NAMES: &[&str] = &[
    "uninstall", "readme", "license", "help", "documentation", "website", "release notes", "user guide", "manual",
    "changelog", "support", "eula", "repair", "troubleshoot", "report a bug", "feedback", "privacy policy", "terms",
    "safe mode", "command line", "console", "updater", "crash", "diagnostic", "install ", "command prompt",
];
const SKIP_TARGET_HINTS: &[&str] = &["\\uninstall", "unins0", "\\installer\\", "\\redist\\", "vcredist", "dxsetup", "\\temp\\", "\\$recycle.bin\\"];

/// Shortcuts whose target is a script host are scripts, not applications.
const SCRIPT_HOSTS: &[&str] = &["/cmd.exe", "/powershell.exe", "/pwsh.exe", "/wscript.exe", "/cscript.exe", "/rundll32.exe", "/mmc.exe", "/msiexec.exe", "/java.exe", "/javaw.exe", "/python.exe", "/pythonw.exe"];
pub fn should_skip_name(name: &str) -> bool {
    let n = name.to_lowercase();
    SKIP_NAMES.iter().any(|s| n.contains(s))
}

pub fn should_skip_target(target: &str) -> bool {
    let t = target.to_lowercase();
    if !t.ends_with(".exe") {
        return true; // .url, .chm, .txt, folders, msc… never launchable "apps"
    }
    let slashed = t.replace('\\', "/");
    SKIP_TARGET_HINTS.iter().any(|h| t.contains(h)) || SCRIPT_HOSTS.iter().any(|h| slashed.ends_with(h))
}

/// Normalize a display name: strip version suffixes and vendor noise.
pub fn normalize_name(name: &str) -> String {
    let mut n = name.trim().to_string();
    for suffix in [" (x64)", " (64-bit)", " (32-bit)", " (x86)", " - Shortcut", " Shortcut"] {
        if n.to_lowercase().ends_with(&suffix.to_lowercase()) {
            n.truncate(n.len() - suffix.len());
        }
    }
    // "Google Chrome 129" → "Google Chrome"
    let trimmed = n.trim_end_matches(|c: char| c.is_ascii_digit() || c == '.' || c == ' ' || c == 'v').to_string();
    if trimmed.len() >= 3 && n.len() - trimmed.len() <= 8 && n.chars().rev().take_while(|c| c.is_ascii_digit() || *c == '.' || *c == ' ').count() > 0 && !trimmed.ends_with(" ") {
        n = trimmed;
    }
    n.trim().to_string()
}

/// Rank: Start Menu shortcuts to real executables outrank App Paths registrations,
/// which outrank built-ins; anything under \Windows\ that isn't a built-in ranks lowest.
pub fn rank_for(source: &str, target: &str) -> u8 {
    let t = target.to_lowercase();
    let base = match source {
        "start-menu-user" => 90,
        "start-menu" => 85,
        "app-paths" => 60,
        "builtin" => 50,
        _ => 30,
    };
    if source != "builtin" && (t.contains("\\windows\\system32\\") || t.contains("\\windows\\syswow64\\")) {
        return 20;
    }
    base
}

/// Walk a Start Menu folder to a bounded depth collecting .lnk shortcuts.
fn collect_shortcuts(dir: &Path, depth: usize, out: &mut Vec<(String, PathBuf)>) {
    if depth > 3 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir() {
            collect_shortcuts(&p, depth + 1, out);
        } else if p.extension().map(|e| e.eq_ignore_ascii_case("lnk")).unwrap_or(false) {
            if let Some(stem) = p.file_stem().and_then(|s| s.to_str()) {
                if !should_skip_name(stem) {
                    out.push((stem.to_string(), p.clone()));
                }
            }
        }
    }
}

fn start_menu_dirs() -> Vec<(PathBuf, &'static str)> {
    let mut dirs = Vec::new();
    if let Ok(pd) = std::env::var("ProgramData") {
        dirs.push((PathBuf::from(pd).join(r"Microsoft\Windows\Start Menu\Programs"), "start-menu"));
    }
    if let Ok(ad) = std::env::var("APPDATA") {
        dirs.push((PathBuf::from(ad).join(r"Microsoft\Windows\Start Menu\Programs"), "start-menu-user"));
    }
    dirs
}

fn builtin_apps() -> Vec<(String, PathBuf)> {
    let sys = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
    let s32 = PathBuf::from(&sys).join("System32");
    let candidates = [
        ("Notepad", s32.join("notepad.exe")),
        ("Calculator", s32.join("calc.exe")),
        ("Paint", s32.join("mspaint.exe")),
        ("Snipping Tool", s32.join("SnippingTool.exe")),
        ("File Explorer", PathBuf::from(&sys).join("explorer.exe")),
        ("Task Manager", s32.join("Taskmgr.exe")),
        ("Windows Settings", s32.join("control.exe")),
        ("Command Prompt", s32.join("cmd.exe")),
        ("Windows Terminal", PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_default()).join(r"Microsoft\WindowsApps\wt.exe")),
    ];
    candidates.into_iter().filter(|(_, p)| p.exists()).map(|(n, p)| (n.to_string(), p)).collect()
}

/// `App Paths` registrations: exe name → full path (HKLM + HKCU).
#[cfg(target_os = "windows")]
fn app_paths() -> Vec<(String, PathBuf)> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;
    let mut out = Vec::new();
    for hive in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        let Ok(key) = RegKey::predef(hive).open_subkey_with_flags(r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths", KEY_READ) else { continue };
        for sub in key.enum_keys().flatten().take(400) {
            let Ok(k) = key.open_subkey_with_flags(&sub, KEY_READ) else { continue };
            let Ok(path) = k.get_value::<String, _>("") else { continue };
            let p = PathBuf::from(path.trim_matches('"'));
            if !p.is_file() {
                continue;
            }
            let name = sub.trim_end_matches(".exe").trim_end_matches(".EXE").to_string();
            out.push((pretty_exe_name(&name), p));
        }
    }
    out
}

#[cfg(not(target_os = "windows"))]
fn app_paths() -> Vec<(String, PathBuf)> {
    vec![]
}

/// "chrome" → "Chrome", "msedge" → "Microsoft Edge", "Code" → "Visual Studio Code".
pub fn pretty_exe_name(stem: &str) -> String {
    match stem.to_lowercase().as_str() {
        "chrome" => "Google Chrome".into(),
        "msedge" => "Microsoft Edge".into(),
        "firefox" => "Firefox".into(),
        "code" => "Visual Studio Code".into(),
        "spotify" => "Spotify".into(),
        "discord" => "Discord".into(),
        "steam" => "Steam".into(),
        "wordpad" => "WordPad".into(),
        "iexplore" => "Internet Explorer".into(),
        "winword" => "Word".into(),
        "excel" => "Excel".into(),
        "powerpnt" => "PowerPoint".into(),
        "outlook" => "Outlook".into(),
        "onenote" => "OneNote".into(),
        "teams" | "ms-teams" => "Microsoft Teams".into(),
        "obs64" | "obs32" => "OBS Studio".into(),
        "vlc" => "VLC".into(),
        "7zfm" => "7-Zip".into(),
        other => {
            let mut c = other.chars();
            match c.next() {
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                None => String::new(),
            }
        }
    }
}

/// Resolve a .lnk to its target path via IShellLinkW (read-only, no execution).
#[cfg(target_os = "windows")]
pub fn resolve_shortcut(lnk: &Path) -> Option<PathBuf> {
    use windows::core::{Interface, HSTRING};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoUninitialize, IPersistFile, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE, STGM_READ};
    use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};
    let init = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) };
    let result = (|| {
        let link: IShellLinkW = unsafe { CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER) }.ok()?;
        let pf: IPersistFile = link.cast().ok()?;
        unsafe { pf.Load(&HSTRING::from(lnk.as_os_str()), STGM_READ) }.ok()?;
        let mut buf = [0u16; 1024];
        unsafe { link.GetPath(&mut buf, std::ptr::null_mut(), 0) }.ok()?;
        let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        let s = String::from_utf16_lossy(&buf[..len]);
        if s.trim().is_empty() {
            return None;
        }
        Some(PathBuf::from(expand_env(&s)))
    })();
    if init.is_ok() {
        unsafe { CoUninitialize() };
    }
    result
}

#[cfg(not(target_os = "windows"))]
pub fn resolve_shortcut(_lnk: &Path) -> Option<PathBuf> {
    None
}

/// Expand %VAR% segments (shortcut targets sometimes contain them).
pub fn expand_env(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(start) = rest.find('%') {
        out.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        match after.find('%') {
            Some(end) => {
                let var = &after[..end];
                match std::env::var(var) {
                    Ok(v) => out.push_str(&v),
                    Err(_) => {
                        out.push('%');
                        out.push_str(var);
                        out.push('%');
                    }
                }
                rest = &after[end + 1..];
            }
            None => {
                out.push_str(&rest[start..]);
                rest = "";
            }
        }
    }
    out.push_str(rest);
    out
}

#[tauri::command]
pub fn discover_apps(registry: tauri::State<AppRegistry>) -> Result<Vec<AppEntry>, String> {
    // (display name, launch path, source, resolved target)
    let mut found: Vec<(String, PathBuf, &str, PathBuf)> = Vec::new();
    for (dir, source) in start_menu_dirs() {
        let mut out = Vec::new();
        collect_shortcuts(&dir, 0, &mut out);
        for (n, p) in out {
            let target = resolve_shortcut(&p).unwrap_or_else(|| p.clone());
            if target != p && should_skip_target(&target.to_string_lossy()) {
                continue;
            }
            found.push((normalize_name(&n), p, source, target));
        }
    }
    for (n, p) in app_paths() {
        if should_skip_target(&p.to_string_lossy()) || should_skip_name(&n) {
            continue;
        }
        found.push((n, p.clone(), "app-paths", p));
    }
    for (n, p) in builtin_apps() {
        found.push((n, p.clone(), "builtin", p));
    }

    // Dedupe by resolved target (case-insensitive), then by display name; keep the best rank.
    let mut by_target: HashMap<String, AppEntry> = HashMap::new();
    let mut by_name: HashMap<String, String> = HashMap::new(); // name → target key
    for (name, path, source, target) in found {
        let path_s = path.to_string_lossy().to_string();
        let target_s = target.to_string_lossy().to_string();
        let rank = rank_for(source, &target_s);
        let tkey = target_s.to_lowercase();
        let nkey = name.to_lowercase();
        if let Some(existing_target) = by_name.get(&nkey) {
            if existing_target != &tkey {
                // Same name, different target (e.g. two Chrome channels): keep the higher rank only.
                if let Some(e) = by_target.get(existing_target) {
                    if e.rank >= rank {
                        continue;
                    }
                    by_target.remove(existing_target);
                }
            }
        }
        let entry = AppEntry { id: stable_id(&path_s), name: name.clone(), path: path_s, source: source.to_string(), target: target_s, rank };
        match by_target.get(&tkey) {
            Some(e) if e.rank >= rank => {}
            _ => {
                by_target.insert(tkey.clone(), entry);
                by_name.insert(nkey, tkey);
            }
        }
    }
    let mut entries: Vec<AppEntry> = by_target.into_values().collect();
    entries.sort_by(|a, b| b.rank.cmp(&a.rank).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));

    let mut map = registry.apps.lock().map_err(|e| e.to_string())?;
    map.clear();
    for e in &entries {
        map.insert(e.id.clone(), e.clone());
    }
    Ok(entries)
}

/// Launch a previously discovered app by id. Unknown ids are refused — the
/// frontend/AI can never pass a path.
#[tauri::command]
pub fn launch_app(registry: tauri::State<AppRegistry>, app_id: String) -> Result<String, String> {
    let entry = {
        let map = registry.apps.lock().map_err(|e| e.to_string())?;
        map.get(&app_id).cloned()
    }
    .ok_or_else(|| "Unknown application id; refusing to launch.".to_string())?;

    launch_path(&entry.path)?;
    Ok(entry.name)
}

/// Shell icon for a discovered app, cached as PNG under the app cache dir.
#[tauri::command]
pub fn app_icon(app: tauri::AppHandle, registry: tauri::State<AppRegistry>, app_id: String) -> Result<Option<String>, String> {
    use tauri::Manager;
    let entry = {
        let map = registry.apps.lock().map_err(|e| e.to_string())?;
        map.get(&app_id).cloned()
    }
    .ok_or_else(|| "Unknown application id.".to_string())?;
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("icons");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let _ = app.asset_protocol_scope().allow_directory(&dir, false);
    let out = dir.join(format!("{}.png", entry.id));
    if out.is_file() {
        return Ok(Some(out.to_string_lossy().to_string()));
    }
    // Prefer the executable's icon; fall back to the shortcut's.
    let source = if Path::new(&entry.target).is_file() { entry.target.as_str() } else { entry.path.as_str() };
    match crate::media_thumbs::shell_image(Path::new(source), 96, crate::media_thumbs::ShellImageKind::Icon) {
        Some(png) => {
            std::fs::write(&out, png).map_err(|e| e.to_string())?;
            Ok(Some(out.to_string_lossy().to_string()))
        }
        None => Ok(None),
    }
}

/// ShellExecute the discovered path (resolves .lnk shortcuts and .exe alike).
/// No `cmd` in the loop: the path is handed to the shell API verbatim.
fn launch_path(path: &str) -> Result<(), String> {
    let p = std::path::Path::new(path);
    if !p.is_file() {
        return Err("Application is no longer present at its discovered path.".into());
    }
    open::that_detached(p).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_helpers_and_non_executables() {
        assert!(should_skip_name("Uninstall Discord"));
        assert!(should_skip_name("Release Notes"));
        assert!(!should_skip_name("Discord"));
        assert!(should_skip_target(r"C:\Program Files\App\unins000.exe"));
        assert!(should_skip_target(r"C:\Program Files\App\Website.url"));
        assert!(should_skip_target(r"C:\Program Files\App\Help.chm"));
        assert!(!should_skip_target(r"C:\Program Files\Discord\Discord.exe"));
        assert!(should_skip_target(r"C:\Windows\System32\cmd.exe"), "script-host shortcuts are not apps");
        assert!(should_skip_name("Install Additional Tools for Node.js"));
    }

    #[test]
    fn normalizes_names_and_ranks_sources() {
        assert_eq!(normalize_name("Google Chrome (x64)"), "Google Chrome");
        assert_eq!(normalize_name("Visual Studio Code"), "Visual Studio Code");
        assert_eq!(normalize_name("7-Zip 24.08"), "7-Zip");
        assert_eq!(pretty_exe_name("msedge"), "Microsoft Edge");
        assert_eq!(pretty_exe_name("blender"), "Blender");
        assert!(rank_for("start-menu-user", r"C:\Users\j\AppData\Local\Discord\Discord.exe") > rank_for("app-paths", r"C:\x\a.exe"));
        assert!(rank_for("app-paths", r"C:\x\a.exe") > rank_for("builtin", r"C:\Windows\System32\notepad.exe"));
        assert_eq!(rank_for("start-menu", r"C:\Windows\System32\odbcad32.exe"), 20, "system32 helpers rank lowest");
    }

    #[test]
    fn expands_environment_segments() {
        std::env::set_var("NEXUS_TEST_VAR", "X:\\Apps");
        assert_eq!(expand_env("%NEXUS_TEST_VAR%\\tool.exe"), "X:\\Apps\\tool.exe");
        assert_eq!(expand_env("%NOPE_NOT_SET%\\a"), "%NOPE_NOT_SET%\\a");
        assert_eq!(expand_env("plain"), "plain");
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn resolves_a_real_shortcut_when_present() {
        // Any Start Menu shortcut will do; the assertion is "resolves to an existing path" or none found.
        let mut found = Vec::new();
        for (dir, _) in start_menu_dirs() {
            collect_shortcuts(&dir, 0, &mut found);
        }
        if let Some((_, lnk)) = found.iter().find(|(_, p)| resolve_shortcut(p).is_some()) {
            let target = resolve_shortcut(lnk).unwrap();
            assert!(!target.as_os_str().is_empty());
        }
    }
}

#[cfg(all(test, target_os = "windows"))]
mod probe {
    #[test]
    #[ignore]
    fn print_discovered_apps() {
        let reg = super::AppRegistry::new();
        // Emulate the command without tauri State: reuse internals.
        let mut found = Vec::new();
        for (dir, _) in super::start_menu_dirs() {
            super::collect_shortcuts(&dir, 0, &mut found);
        }
        let mut resolved = 0;
        let mut skipped = 0;
        for (n, p) in &found {
            match super::resolve_shortcut(p) {
                Some(t) => {
                    resolved += 1;
                    if super::should_skip_target(&t.to_string_lossy()) { skipped += 1; } else if resolved <= 40 { println!("{:40} -> {}", n, t.display()); }
                }
                None => {}
            }
        }
        println!("shortcuts={} resolved={} skipped={} app_paths={}", found.len(), resolved, skipped, super::app_paths().len());
        let _ = reg;
    }
}
