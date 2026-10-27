//! Opening a video and its folder — local only.
//!
//! The user picks (or drops, or "opens with") a video. NEXUS grants the WebView
//! read access to THAT folder only (non-recursive asset scope) and lists the
//! other videos beside it. No recursion, no drive scanning, reparse points
//! (symlinks/junctions) are skipped, and the listing is bounded.

use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;

/// Containers WebView2 decodes natively.
pub const PLAYABLE_EXT: &[&str] = &["mp4", "m4v", "webm", "mov", "ogv"];
/// Listed (with a hint) but may not decode, depending on installed codecs.
pub const MAYBE_EXT: &[&str] = &["mkv", "avi", "wmv", "ts", "mpg", "mpeg", "flv"];
const MAX_ENTRIES: usize = 5_000;

#[derive(Default)]
pub struct LibraryState {
    /// Canonical folders the user opened this session (asset scope + thumbnails).
    pub granted: Mutex<HashSet<PathBuf>>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VideoEntry {
    pub path: String,
    pub name: String,
    pub ext: String,
    pub size_bytes: u64,
    pub modified: u64,
    pub playable: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FolderListing {
    pub folder: String,
    pub folder_name: String,
    /// The opened file, when a file (not a folder) was opened.
    pub current: Option<String>,
    pub videos: Vec<VideoEntry>,
    pub truncated: bool,
}

/// Strip the Windows verbatim prefix so paths display and compare consistently.
pub fn normalize(p: &Path) -> PathBuf {
    let s = p.to_string_lossy();
    PathBuf::from(s.strip_prefix(r"\\?\").unwrap_or(&s).to_string())
}

pub fn video_ext(path: &Path) -> Option<(String, bool)> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    if PLAYABLE_EXT.contains(&ext.as_str()) {
        Some((ext, true))
    } else if MAYBE_EXT.contains(&ext.as_str()) {
        Some((ext, false))
    } else {
        None
    }
}

#[cfg(windows)]
fn is_reparse(meta: &std::fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    meta.file_attributes() & 0x400 != 0
}
#[cfg(not(windows))]
fn is_reparse(meta: &std::fs::Metadata) -> bool {
    meta.file_type().is_symlink()
}

/// Natural, case-insensitive ordering ("clip 2" before "clip 10").
pub fn natural_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    let (a, b) = (a.to_lowercase(), b.to_lowercase());
    let (mut ai, mut bi) = (a.chars().peekable(), b.chars().peekable());
    loop {
        match (ai.peek().copied(), bi.peek().copied()) {
            (None, None) => return std::cmp::Ordering::Equal,
            (None, _) => return std::cmp::Ordering::Less,
            (_, None) => return std::cmp::Ordering::Greater,
            (Some(x), Some(y)) if x.is_ascii_digit() && y.is_ascii_digit() => {
                let mut na = String::new();
                while let Some(c) = ai.peek().copied().filter(|c| c.is_ascii_digit()) { na.push(c); ai.next(); }
                let mut nb = String::new();
                while let Some(c) = bi.peek().copied().filter(|c| c.is_ascii_digit()) { nb.push(c); bi.next(); }
                let (ta, tb) = (na.trim_start_matches('0'), nb.trim_start_matches('0'));
                let ord = ta.len().cmp(&tb.len()).then_with(|| ta.cmp(tb));
                if ord != std::cmp::Ordering::Equal {
                    return ord;
                }
            }
            (Some(x), Some(y)) => {
                if x != y {
                    return x.cmp(&y);
                }
                ai.next();
                bi.next();
            }
        }
    }
}

/// Videos directly inside `dir` (no recursion), naturally sorted, bounded.
pub fn list_videos(dir: &Path) -> (Vec<VideoEntry>, bool) {
    let mut out = Vec::new();
    let mut truncated = false;
    let Ok(rd) = std::fs::read_dir(dir) else { return (out, false) };
    for e in rd.flatten() {
        let Ok(meta) = e.metadata() else { continue };
        if !meta.is_file() || is_reparse(&meta) {
            continue;
        }
        let path = e.path();
        let Some((ext, playable)) = video_ext(&path) else { continue };
        if out.len() >= MAX_ENTRIES {
            truncated = true;
            break;
        }
        let modified = meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
        out.push(VideoEntry {
            name: path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default(),
            path: normalize(&path).to_string_lossy().to_string(),
            ext,
            size_bytes: meta.len(),
            modified,
            playable,
        });
    }
    out.sort_by(|a, b| natural_cmp(&a.name, &b.name).then_with(|| a.ext.cmp(&b.ext)));
    (out, truncated)
}

fn grant_and_list(app: &tauri::AppHandle, state: &LibraryState, folder: &Path, current: Option<String>) -> Result<FolderListing, String> {
    // Read access for this folder only — never its subfolders.
    app.asset_protocol_scope().allow_directory(folder, false).map_err(|e| e.to_string())?;
    state.granted.lock().map_err(|e| e.to_string())?.insert(folder.to_path_buf());
    let (videos, truncated) = list_videos(folder);
    Ok(FolderListing {
        folder: normalize(folder).to_string_lossy().to_string(),
        folder_name: folder.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| normalize(folder).to_string_lossy().to_string()),
        current,
        videos,
        truncated,
    })
}

/// Open a video file: grant its folder and list the videos beside it.
#[tauri::command]
pub fn open_video(app: tauri::AppHandle, state: tauri::State<LibraryState>, path: String) -> Result<FolderListing, String> {
    let canon = PathBuf::from(path.trim()).canonicalize().map_err(|_| "That file could not be found.".to_string())?;
    if !canon.is_file() {
        return Err("Choose a video file.".into());
    }
    if video_ext(&canon).is_none() {
        return Err("That file is not a supported video.".into());
    }
    let folder = canon.parent().ok_or("The file has no folder.")?.to_path_buf();
    grant_and_list(&app, &state, &folder, Some(normalize(&canon).to_string_lossy().to_string()))
}

/// Open a folder directly (folder picker): list its videos, nothing selected.
#[tauri::command]
pub fn open_folder(app: tauri::AppHandle, state: tauri::State<LibraryState>, path: String) -> Result<FolderListing, String> {
    let canon = PathBuf::from(path.trim()).canonicalize().map_err(|_| "That folder could not be found.".to_string())?;
    if !canon.is_dir() {
        return Err("Choose a folder.".into());
    }
    grant_and_list(&app, &state, &canon, None)
}

/// Re-list the current folder (files added/removed while open).
#[tauri::command]
pub fn refresh_folder(app: tauri::AppHandle, state: tauri::State<LibraryState>, folder: String) -> Result<FolderListing, String> {
    let canon = PathBuf::from(folder.trim()).canonicalize().map_err(|_| "The folder is no longer available.".to_string())?;
    if !state.granted.lock().map_err(|e| e.to_string())?.contains(&canon) {
        return Err("Folder was not opened by the user.".into());
    }
    grant_and_list(&app, &state, &canon, None)
}

/// A video passed on the command line ("Open with NEXUS" / double-click).
#[tauri::command]
pub fn launch_file() -> Option<String> {
    std::env::args().skip(1).find(|a| !a.starts_with('-') && video_ext(Path::new(a)).is_some() && Path::new(a).is_file())
}

/// Whether `file` sits directly inside a folder the user opened (canonical compare).
pub fn in_granted_folder(state: &LibraryState, file: &Path) -> bool {
    let Ok(canon) = file.canonicalize() else { return false };
    let Some(parent) = canon.parent() else { return false };
    state.granted.lock().map(|g| g.contains(parent)).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("nexus-lib-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn lists_only_videos_directly_in_the_folder_naturally_sorted() {
        let d = tmp("list");
        for f in ["clip 10.mp4", "clip 2.mp4", "Clip 1.MOV", "notes.txt", "cover.jpg", "old.mkv"] {
            std::fs::write(d.join(f), b"x").unwrap();
        }
        std::fs::create_dir_all(d.join("sub")).unwrap();
        std::fs::write(d.join("sub").join("nested.mp4"), b"x").unwrap();
        let (v, truncated) = list_videos(&d);
        assert!(!truncated);
        assert_eq!(v.iter().map(|e| e.name.as_str()).collect::<Vec<_>>(), ["Clip 1", "clip 2", "clip 10", "old"]);
        assert!(v.iter().find(|e| e.name == "old").map(|e| !e.playable).unwrap());
        assert!(v.iter().all(|e| !e.path.contains("nested")));
        let _ = std::fs::remove_dir_all(d);
    }

    #[test]
    fn natural_order_handles_numbers_and_case() {
        let mut v = vec!["b", "A 10", "a 9", "a 09x", "a 1"];
        v.sort_by(|a, b| natural_cmp(a, b));
        assert_eq!(v, ["a 1", "a 9", "a 09x", "A 10", "b"]);
    }

    #[test]
    fn only_known_video_extensions_are_accepted() {
        assert_eq!(video_ext(Path::new("a.MP4")), Some(("mp4".into(), true)));
        assert_eq!(video_ext(Path::new("a.mkv")), Some(("mkv".into(), false)));
        assert_eq!(video_ext(Path::new("a.exe")), None);
        assert_eq!(video_ext(Path::new("noext")), None);
    }

    #[test]
    fn granted_folder_check_is_direct_children_only() {
        let d = tmp("grant");
        std::fs::create_dir_all(d.join("sub")).unwrap();
        std::fs::write(d.join("a.mp4"), b"x").unwrap();
        std::fs::write(d.join("sub").join("b.mp4"), b"x").unwrap();
        let state = LibraryState::default();
        state.granted.lock().unwrap().insert(d.canonicalize().unwrap());
        assert!(in_granted_folder(&state, &d.join("a.mp4")));
        assert!(!in_granted_folder(&state, &d.join("sub").join("b.mp4")));
        assert!(!in_granted_folder(&state, &d.join("missing.mp4")));
        let _ = std::fs::remove_dir_all(d);
    }
}
