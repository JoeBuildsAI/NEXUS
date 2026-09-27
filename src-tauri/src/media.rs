//! Local media — PRIVATE BY DESIGN.
//!
//! Access is limited to roots the user explicitly authorized through a folder
//! picker. Scans are bounded (depth, file count, time), skip reparse points
//! (symlinks/junctions), verify containment after canonicalization, run on a
//! background thread with progress events, and are cancellable. Nothing here
//! logs filenames or paths.

use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};

const MAX_DEPTH: usize = 10;
const MAX_FILES: usize = 25_000;
const MAX_DIRS: usize = 20_000;
const TIME_BUDGET: Duration = Duration::from_secs(45);

pub const PLAYABLE_EXT: &[&str] = &["mp4", "webm", "m4v", "mov", "ogv"];
pub const MAYBE_EXT: &[&str] = &["mkv", "avi", "wmv", "flv", "ts", "mpg", "mpeg"];

pub struct MediaState {
    /// Canonical authorized roots (lowercased string form for comparison).
    pub roots: Mutex<HashSet<PathBuf>>,
    pub cancel: Arc<AtomicBool>,
    pub scanning: AtomicBool,
}

impl MediaState {
    pub fn new() -> Self {
        Self { roots: Mutex::new(HashSet::new()), cancel: Arc::new(AtomicBool::new(false)), scanning: AtomicBool::new(false) }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AuthorizedRootInfo {
    pub id: String,
    pub path: String,
    pub kind: String, // fixed | removable | network | unknown
    pub exists: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MediaFile {
    pub id: String,
    pub path: String,
    pub name: String,
    pub folder: String,
    pub ext: String,
    pub size_bytes: u64,
    pub modified: u64,
    pub playability: String, // playable | potentially-unsupported
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub root_id: String,
    pub files: usize,
    pub folders: usize,
    pub done: bool,
    pub cancelled: bool,
    pub truncated: bool,
}

pub fn root_id(path: &Path) -> String {
    let s = path.to_string_lossy().to_lowercase();
    let mut h: u64 = 0xcbf29ce484222325;
    for b in s.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("root-{h:016x}")
}

pub fn file_id(path: &Path) -> String {
    let s = path.to_string_lossy().to_lowercase();
    let mut h: u64 = 0x84222325cbf29ce4;
    for b in s.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("mf-{h:016x}")
}

/// Strip Windows verbatim prefix so paths compare/display consistently.
pub fn normalize(p: &Path) -> PathBuf {
    let s = p.to_string_lossy();
    PathBuf::from(s.strip_prefix(r"\\?\").unwrap_or(&s).to_string())
}

/// True if `candidate` is inside `root` after canonicalization (both must exist).
pub fn is_within(root: &Path, candidate: &Path) -> bool {
    let (Ok(r), Ok(c)) = (root.canonicalize(), candidate.canonicalize()) else { return false };
    let r = normalize(&r).to_string_lossy().to_lowercase();
    let c = normalize(&c).to_string_lossy().to_lowercase();
    c == r || c.starts_with(&format!("{}\\", r.trim_end_matches('\\')))
}

fn drive_kind(path: &Path) -> String {
    let disks = sysinfo::Disks::new_with_refreshed_list();
    let p = path.to_string_lossy().to_lowercase();
    let mut best: Option<(usize, String)> = None;
    for d in disks.list() {
        let mp = d.mount_point().to_string_lossy().to_lowercase();
        if p.starts_with(mp.trim_end_matches('\\')) {
            let kind = if d.is_removable() { "removable" } else { "fixed" };
            if best.as_ref().map(|(l, _)| mp.len() > *l).unwrap_or(true) {
                best = Some((mp.len(), kind.to_string()));
            }
        }
    }
    if p.starts_with("\\\\") {
        return "network".into();
    }
    best.map(|(_, k)| k).unwrap_or_else(|| "unknown".into())
}

fn classify(ext: &str) -> Option<&'static str> {
    let e = ext.to_lowercase();
    if PLAYABLE_EXT.contains(&e.as_str()) {
        Some("playable")
    } else if MAYBE_EXT.contains(&e.as_str()) {
        Some("potentially-unsupported")
    } else {
        None
    }
}

/// Register a user-selected folder as an authorized root. The path must exist
/// and be a directory; it is canonicalized and added to the asset protocol
/// scope so the WebView can stream files from it (and only it).
/// Folders that make no sense as media roots and must never be exposed to the
/// WebView: Windows itself, program installs, machine-wide app data, NEXUS data.
pub fn is_forbidden_root(canon: &Path) -> bool {
    let c = canon.to_string_lossy().to_lowercase().trim_end_matches('\\').to_string();
    let mut blocked: Vec<String> = vec![];
    for var in ["SystemRoot", "ProgramFiles", "ProgramFiles(x86)", "ProgramData", "APPDATA", "LOCALAPPDATA"] {
        if let Ok(v) = std::env::var(var) {
            blocked.push(v.to_lowercase().trim_end_matches('\\').to_string());
        }
    }
    blocked.iter().any(|b| !b.is_empty() && (c == *b || c.starts_with(&format!("{b}\\"))))
}

#[tauri::command]
pub fn media_register_root(app: tauri::AppHandle, state: tauri::State<MediaState>, path: String) -> Result<AuthorizedRootInfo, String> {
    let p = PathBuf::from(path.trim());
    if !p.is_dir() {
        return Err("Folder does not exist or is not a directory.".into());
    }
    let canon = normalize(&p.canonicalize().map_err(|e| e.to_string())?);
    if is_forbidden_root(&canon) {
        return Err("System and application folders can't be used as media locations.".into());
    }
    let _ = app.asset_protocol_scope().allow_directory(&canon, true);
    state.roots.lock().map_err(|e| e.to_string())?.insert(canon.clone());
    Ok(AuthorizedRootInfo { id: root_id(&canon), path: canon.to_string_lossy().to_string(), kind: drive_kind(&canon), exists: true })
}

/// Revoke: stop indexing/access. Removes from the asset scope.
#[tauri::command]
pub fn media_revoke_root(app: tauri::AppHandle, state: tauri::State<MediaState>, path: String) -> Result<(), String> {
    let p = normalize(&PathBuf::from(path.trim()));
    let _ = app.asset_protocol_scope().forbid_directory(&p, true);
    state.roots.lock().map_err(|e| e.to_string())?.remove(&p);
    Ok(())
}

/// Existence/kind check for previously authorized roots (e.g. drive unplugged).
#[tauri::command]
pub fn media_root_status(path: String) -> Result<AuthorizedRootInfo, String> {
    let p = normalize(&PathBuf::from(path.trim()));
    Ok(AuthorizedRootInfo { id: root_id(&p), path: p.to_string_lossy().to_string(), kind: drive_kind(&p), exists: p.is_dir() })
}

/// Check that a previously indexed file still exists inside an authorized root.
#[tauri::command]
pub fn media_file_exists(state: tauri::State<MediaState>, path: String) -> Result<bool, String> {
    let p = PathBuf::from(path.trim());
    let roots = state.roots.lock().map_err(|e| e.to_string())?;
    Ok(p.is_file() && roots.iter().any(|r| is_within(r, &p)))
}

#[tauri::command]
pub fn media_cancel_scan(state: tauri::State<MediaState>) -> Result<(), String> {
    state.cancel.store(true, Ordering::SeqCst);
    Ok(())
}

/// Start a bounded scan of ONE authorized root on a background thread.
/// Emits `media:scan-progress` periodically and `media:scan-complete` with files.
#[tauri::command]
pub fn media_scan_root(app: tauri::AppHandle, state: tauri::State<MediaState>, path: String) -> Result<String, String> {
    let root = normalize(&PathBuf::from(path.trim()));
    {
        let roots = state.roots.lock().map_err(|e| e.to_string())?;
        if !roots.contains(&root) {
            return Err("Folder is not authorized.".into());
        }
    }
    if !root.is_dir() {
        return Err("Media source disconnected.".into());
    }
    if state.scanning.swap(true, Ordering::SeqCst) {
        return Err("A scan is already running.".into());
    }
    state.cancel.store(false, Ordering::SeqCst);
    let cancel = state.cancel.clone();
    let rid = root_id(&root);
    let rid_ret = rid.clone();
    let app2 = app.clone();

    std::thread::spawn(move || {
        let result = scan(&root, &rid, &cancel, |p| {
            let _ = app2.emit("media:scan-progress", p);
        });
        let _ = app2.emit("media:scan-complete", &result);
        if let Some(st) = app2.try_state::<MediaState>() {
            st.scanning.store(false, Ordering::SeqCst);
        }
    });
    Ok(rid_ret)
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub root_id: String,
    pub files: Vec<MediaFile>,
    pub folders: usize,
    pub cancelled: bool,
    pub truncated: bool,
}

pub fn scan(root: &Path, rid: &str, cancel: &AtomicBool, mut on_progress: impl FnMut(ScanProgress)) -> ScanResult {
    let start = Instant::now();
    let mut files: Vec<MediaFile> = Vec::new();
    let mut folders = 0usize;
    let mut truncated = false;
    let mut stack: Vec<(PathBuf, usize)> = vec![(root.to_path_buf(), 0)];
    let mut last_emit = Instant::now();
    let root_str = normalize(root).to_string_lossy().to_string();

    while let Some((dir, depth)) = stack.pop() {
        if cancel.load(Ordering::SeqCst) {
            break;
        }
        if start.elapsed() > TIME_BUDGET || files.len() >= MAX_FILES || folders >= MAX_DIRS {
            truncated = true;
            break;
        }
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        folders += 1;
        for entry in rd.flatten() {
            // Never follow reparse points (symlinks / junctions) — they can escape the root.
            let Ok(meta) = entry.metadata() else { continue };
            let Ok(sym) = std::fs::symlink_metadata(entry.path()) else { continue };
            if sym.file_type().is_symlink() {
                continue;
            }
            let p = entry.path();
            if meta.is_dir() {
                if depth + 1 <= MAX_DEPTH {
                    let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                    if name.starts_with('.') || name.eq_ignore_ascii_case("$RECYCLE.BIN") || name.eq_ignore_ascii_case("System Volume Information") {
                        continue;
                    }
                    stack.push((p, depth + 1));
                }
                continue;
            }
            let Some(ext) = p.extension().and_then(|e| e.to_str()) else { continue };
            let Some(play) = classify(ext) else { continue };
            // Containment check on the parent (cheap; files inherit).
            if !p.to_string_lossy().to_lowercase().starts_with(&root_str.to_lowercase()) {
                continue;
            }
            let name = p.file_stem().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            let folder = p.parent().and_then(|d| d.strip_prefix(root).ok()).map(|d| d.to_string_lossy().to_string()).unwrap_or_default();
            files.push(MediaFile {
                id: file_id(&p),
                path: p.to_string_lossy().to_string(),
                name,
                folder,
                ext: ext.to_lowercase(),
                size_bytes: meta.len(),
                modified: meta.modified().ok().and_then(|m| m.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0),
                playability: play.to_string(),
            });
            if files.len() >= MAX_FILES {
                truncated = true;
                break;
            }
        }
        if last_emit.elapsed() > Duration::from_millis(150) {
            last_emit = Instant::now();
            on_progress(ScanProgress { root_id: rid.to_string(), files: files.len(), folders, done: false, cancelled: false, truncated: false });
        }
    }
    let cancelled = cancel.load(Ordering::SeqCst);
    on_progress(ScanProgress { root_id: rid.to_string(), files: files.len(), folders, done: true, cancelled, truncated });
    files.sort_by(|a, b| a.folder.to_lowercase().cmp(&b.folder.to_lowercase()).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    ScanResult { root_id: rid.to_string(), files, folders, cancelled, truncated }
}

#[allow(dead_code)]
fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    static FIXTURE_SEQ: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

    fn fixture() -> PathBuf {
        let seq = FIXTURE_SEQ.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("nexus-media-fixture-{}-{}-{}", std::process::id(), now_ms(), seq));
        std::fs::create_dir_all(dir.join("Clips").join("Nested")).unwrap();
        std::fs::create_dir_all(dir.join(".hidden")).unwrap();
        std::fs::write(dir.join("a.mp4"), b"x").unwrap();
        std::fs::write(dir.join("Clips").join("b.mkv"), b"x").unwrap();
        std::fs::write(dir.join("Clips").join("Nested").join("c.webm"), b"x").unwrap();
        std::fs::write(dir.join("Clips").join("notes.txt"), b"x").unwrap();
        std::fs::write(dir.join(".hidden").join("d.mp4"), b"x").unwrap();
        dir
    }

    #[test]
    fn scans_nested_media_and_classifies_playability() {
        let dir = fixture();
        let cancel = AtomicBool::new(false);
        let res = scan(&dir, "r", &cancel, |_| {});
        let names: Vec<_> = res.files.iter().map(|f| f.name.clone()).collect();
        assert!(names.contains(&"a".to_string()));
        assert!(names.contains(&"b".to_string()));
        assert!(names.contains(&"c".to_string()));
        assert!(!names.contains(&"d".to_string()), "hidden folders are skipped");
        assert_eq!(res.files.iter().find(|f| f.name == "b").unwrap().playability, "potentially-unsupported");
        assert_eq!(res.files.iter().find(|f| f.name == "a").unwrap().playability, "playable");
        assert!(!res.truncated && !res.cancelled);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn cancel_stops_scan() {
        let dir = fixture();
        let cancel = AtomicBool::new(true);
        let res = scan(&dir, "r", &cancel, |_| {});
        assert!(res.cancelled);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn containment_rejects_escape() {
        let dir = fixture();
        assert!(is_within(&dir, &dir.join("Clips").join("b.mkv")));
        assert!(is_within(&dir, &dir.join("Clips").join("..").join("a.mp4")));
        assert!(!is_within(&dir, &dir.join("..")));
        assert!(!is_within(&dir, &std::env::temp_dir()));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn junctions_are_not_followed() {
        // A directory junction inside the root pointing outside must be skipped.
        let dir = fixture();
        let outside = std::env::temp_dir().join(format!("nexus-media-outside-{}", std::process::id()));
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(outside.join("escaped.mp4"), b"x").unwrap();
        let link = dir.join("Link");
        let made = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J", &link.to_string_lossy(), &outside.to_string_lossy()])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if made {
            let cancel = AtomicBool::new(false);
            let res = scan(&dir, "r", &cancel, |_| {});
            assert!(!res.files.iter().any(|f| f.name == "escaped"), "junction target was indexed");
            let _ = std::fs::remove_dir(&link);
        }
        let _ = std::fs::remove_dir_all(&outside);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn system_folders_are_forbidden_roots() {
        if let Ok(root) = std::env::var("SystemRoot") {
            assert!(is_forbidden_root(Path::new(&root)));
            assert!(is_forbidden_root(&Path::new(&root).join("System32")));
        }
        if let Ok(pf) = std::env::var("ProgramFiles") {
            assert!(is_forbidden_root(Path::new(&pf)));
        }
        assert!(!is_forbidden_root(Path::new("X:\\Videos")));
        assert!(!is_forbidden_root(Path::new("D:\\")));
    }
}
