use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Discovered application. `id` is a stable hash of the path; the frontend only
/// ever refers to apps by id, never by path, so it cannot launch arbitrary files.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppEntry {
    id: String,
    name: String,
    path: String,
    source: String,
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

fn stable_id(path: &str) -> String {
    // FNV-1a 64 — stable across runs, no extra deps.
    let mut h: u64 = 0xcbf29ce484222325;
    for b in path.to_lowercase().bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("app-{h:016x}")
}

const SKIP_NAMES: &[&str] = &[
    "uninstall", "readme", "license", "help", "documentation", "website", "release notes",
    "user guide", "manual", "changelog", "support", "eula", "repair",
];

fn should_skip(name: &str) -> bool {
    let n = name.to_lowercase();
    SKIP_NAMES.iter().any(|s| n.contains(s))
}

/// Walk a Start Menu folder to a bounded depth collecting .lnk shortcuts.
/// This is NOT a disk scan — Start Menu folders are small and curated by installers.
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
                if !should_skip(stem) {
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
        ("Windows Terminal", PathBuf::from(
            std::env::var("LOCALAPPDATA").unwrap_or_default(),
        ).join(r"Microsoft\WindowsApps\wt.exe")),
    ];
    candidates
        .into_iter()
        .filter(|(_, p)| p.exists())
        .map(|(n, p)| (n.to_string(), p))
        .collect()
}

#[tauri::command]
pub fn discover_apps(registry: tauri::State<AppRegistry>) -> Result<Vec<AppEntry>, String> {
    let mut found: Vec<(String, PathBuf, &str)> = Vec::new();
    for (dir, source) in start_menu_dirs() {
        let mut out = Vec::new();
        collect_shortcuts(&dir, 0, &mut out);
        for (n, p) in out {
            found.push((n, p, source));
        }
    }
    for (n, p) in builtin_apps() {
        found.push((n, p, "builtin"));
    }

    // Dedupe by display name (case-insensitive), preferring earlier sources.
    let mut seen = std::collections::HashSet::new();
    let mut entries: Vec<AppEntry> = Vec::new();
    for (name, path, source) in found {
        let key = name.to_lowercase();
        if !seen.insert(key) {
            continue;
        }
        let path_s = path.to_string_lossy().to_string();
        entries.push(AppEntry {
            id: stable_id(&path_s),
            name,
            path: path_s,
            source: source.to_string(),
        });
    }
    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

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

#[cfg(target_os = "windows")]
fn launch_path(path: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    // `start ""` resolves .lnk shortcuts and .exe alike via the shell.
    std::process::Command::new("cmd")
        .args(["/C", "start", "", path])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "windows"))]
fn launch_path(_path: &str) -> Result<(), String> {
    Err("launch_app is only implemented on Windows".into())
}
