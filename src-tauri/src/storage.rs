//! Storage analysis and the safe cleanup engine.
//!
//! Analysis: bounded walks of KNOWN locations on a FIXED drive (never removable
//! or network, never authorized media roots — media authorization is a separate
//! permission domain from cleanup). Results carry a confidence label.
//!
//! Cleanup: explicit rules only (id, discovery, risk, elevation, execution).
//! DISCOVER → PROPOSE → APPROVE → EXECUTE → REPORT, with dry-run.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant, SystemTime};
use tauri::{Emitter, Manager};

const WALK_FILE_CAP: usize = 200_000;
const WALK_TIME_CAP: Duration = Duration::from_secs(20);

#[derive(Default, Clone, Copy)]
struct WalkStats {
    bytes: u64,
    files: usize,
    truncated: bool,
}

fn walk_size(root: &Path, deadline: Instant, cancel: &AtomicBool, filter: &dyn Fn(&Path, &std::fs::Metadata) -> bool) -> WalkStats {
    let mut st = WalkStats::default();
    if !root.is_dir() {
        return st;
    }
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        if cancel.load(Ordering::SeqCst) || Instant::now() > deadline || st.files >= WALK_FILE_CAP {
            st.truncated = true;
            break;
        }
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            let Ok(sym) = std::fs::symlink_metadata(e.path()) else { continue };
            if sym.file_type().is_symlink() {
                continue; // never follow reparse points
            }
            if sym.is_dir() {
                stack.push(e.path());
            } else if filter(&e.path(), &sym) {
                st.bytes += sym.len();
                st.files += 1;
            }
        }
    }
    st
}

fn on_drive(p: &Path, drive: &str) -> bool {
    p.to_string_lossy().to_lowercase().starts_with(&drive.to_lowercase().trim_end_matches('\\').to_string())
}

fn env_path(var: &str) -> Option<PathBuf> {
    std::env::var(var).ok().map(PathBuf::from).filter(|p| p.is_dir())
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CategoryUsage {
    category: String,
    bytes: u64,
    item_count: usize,
    confidence: String, // known | estimated | not-analyzed
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Analysis {
    drive: String,
    total_bytes: u64,
    used_bytes: u64,
    free_bytes: u64,
    categories: Vec<CategoryUsage>,
    analyzed_at: u64,
    cancelled: bool,
}

pub struct StorageState {
    pub cancel: AtomicBool,
    pub running: AtomicBool,
}
impl StorageState {
    pub fn new() -> Self {
        Self { cancel: AtomicBool::new(false), running: AtomicBool::new(false) }
    }
}

fn drive_info(drive: &str) -> Result<(u64, u64), String> {
    let disks = sysinfo::Disks::new_with_refreshed_list();
    let want = drive.to_lowercase().trim_end_matches('\\').to_string();
    for d in disks.list() {
        let mp = d.mount_point().to_string_lossy().to_lowercase().trim_end_matches('\\').to_string();
        if mp == want {
            if d.is_removable() {
                return Err("Refusing to analyze a removable drive.".into());
            }
            return Ok((d.total_space(), d.available_space()));
        }
    }
    Err("Drive not found or not a fixed drive.".into())
}

/// Known locations per category, filtered to the target drive.
fn locations(drive: &str, steam_libraries: &[String]) -> Vec<(&'static str, Vec<PathBuf>)> {
    let up = env_path("USERPROFILE");
    let la = env_path("LOCALAPPDATA");
    let sysroot = env_path("SystemRoot").unwrap_or_else(|| PathBuf::from(r"C:\Windows"));
    let pf = env_path("ProgramFiles");
    let pf86 = env_path("ProgramFiles(x86)");
    let mut games: Vec<PathBuf> = steam_libraries.iter().map(|l| PathBuf::from(l).join("steamapps")).collect();
    for base in [&pf, &pf86] {
        if let Some(b) = base {
            games.push(b.join("Epic Games"));
        }
    }
    let mut v: Vec<(&str, Vec<PathBuf>)> = vec![
        ("system", vec![sysroot.clone()]),
        ("applications", [pf.clone(), pf86.clone(), la.as_ref().map(|l| l.join("Programs"))].into_iter().flatten().collect()),
        ("games", games),
        ("documents", up.iter().flat_map(|u| [u.join("Documents"), u.join("Desktop"), u.join("Pictures")]).collect()),
        ("downloads", up.iter().map(|u| u.join("Downloads")).collect()),
        ("media", up.iter().flat_map(|u| [u.join("Videos"), u.join("Music")]).collect()),
        ("temporary", [env_path("TEMP"), Some(sysroot.join("Temp")), la.as_ref().map(|l| l.join("NVIDIA").join("DXCache")), la.as_ref().map(|l| l.join("D3DSCache")), la.as_ref().map(|l| l.join("CrashDumps"))].into_iter().flatten().collect()),
    ];
    for (_, paths) in v.iter_mut() {
        paths.retain(|p| on_drive(p, drive) && p.is_dir());
    }
    v
}

#[tauri::command]
pub fn storage_cancel(state: tauri::State<StorageState>) -> Result<(), String> {
    state.cancel.store(true, Ordering::SeqCst);
    Ok(())
}

/// Start a bounded analysis of a fixed drive. Emits `storage:progress`
/// ({category, bytes}) and `storage:complete` (Analysis).
#[tauri::command]
pub fn storage_analyze(app: tauri::AppHandle, state: tauri::State<StorageState>, drive: String, steam_libraries: Vec<String>) -> Result<(), String> {
    let (total, free) = drive_info(&drive)?;
    if state.running.swap(true, Ordering::SeqCst) {
        return Err("Analysis already running.".into());
    }
    state.cancel.store(false, Ordering::SeqCst);
    let app2 = app.clone();
    std::thread::spawn(move || {
        let st = app2.state::<StorageState>();
        let deadline = Instant::now() + Duration::from_secs(90);
        let mut cats: Vec<CategoryUsage> = Vec::new();
        let mut known: u64 = 0;
        for (cat, paths) in locations(&drive, &steam_libraries) {
            let mut bytes = 0u64;
            let mut files = 0usize;
            let mut truncated = false;
            for p in &paths {
                // Windows dir is huge: shorter per-location budget and label estimated if capped.
                let local_deadline = std::cmp::min(deadline, Instant::now() + WALK_TIME_CAP);
                let s = walk_size(p, local_deadline, &st.cancel, &|_, _| true);
                bytes += s.bytes;
                files += s.files;
                truncated |= s.truncated;
            }
            known += bytes;
            let confidence = if paths.is_empty() { "not-analyzed" } else if truncated { "estimated" } else { "known" };
            cats.push(CategoryUsage { category: cat.to_string(), bytes, item_count: files, confidence: confidence.into() });
            let _ = app2.emit("storage:progress", serde_json::json!({ "category": cat, "bytes": bytes }));
            if st.cancel.load(Ordering::SeqCst) {
                break;
            }
        }
        let used = total.saturating_sub(free);
        cats.push(CategoryUsage { category: "other".into(), bytes: used.saturating_sub(known), item_count: 0, confidence: "not-analyzed".into() });
        let result = Analysis {
            drive: drive.clone(),
            total_bytes: total,
            used_bytes: used,
            free_bytes: free,
            categories: cats,
            analyzed_at: SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0),
            cancelled: st.cancel.load(Ordering::SeqCst),
        };
        let _ = app2.emit("storage:complete", &result);
        st.running.store(false, Ordering::SeqCst);
    });
    Ok(())
}

// ---------------------------------------------------------------- cleanup

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CleanupRule {
    id: &'static str,
    label: &'static str,
    description: &'static str,
    risk: &'static str, // safe | review
    requires_elevation: bool,
    discovery: &'static str,
    execution: &'static str,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CleanupCandidate {
    rule: CleanupRule,
    bytes: u64,
    file_count: usize,
    accessible: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CleanupReportItem {
    rule_id: String,
    freed_bytes: u64,
    removed: usize,
    skipped: usize,
    dry_run: bool,
    error: Option<String>,
}

const RULES: &[CleanupRule] = &[
    CleanupRule { id: "user-temp", label: "User temp files", description: "Files in %TEMP% not modified in 7 days. Apps recreate these as needed.", risk: "safe", requires_elevation: false, discovery: "walk %TEMP%, mtime > 7d", execution: "delete matched files (skip locked)" },
    CleanupRule { id: "windows-temp", label: "Windows temp files", description: "Files in C:\\Windows\\Temp not modified in 7 days. Some require administrator rights and are skipped.", risk: "safe", requires_elevation: true, discovery: "walk %SystemRoot%\\Temp, mtime > 7d", execution: "delete matched files (skip locked/denied)" },
    CleanupRule { id: "shader-cache", label: "GPU shader caches", description: "DirectX/NVIDIA/AMD shader caches. Games rebuild them, which can mean long first loads and stutter until they are recompiled — usually not worth clearing on a gaming PC.", risk: "review", requires_elevation: false, discovery: "walk DXCache, D3DSCache, AMD DxCache", execution: "delete cache files (skip locked)" },
    CleanupRule { id: "crash-dumps", label: "Crash dumps", description: "Application crash dumps in %LOCALAPPDATA%\\CrashDumps. Only useful for debugging past crashes.", risk: "safe", requires_elevation: false, discovery: "walk CrashDumps", execution: "delete *.dmp" },
    CleanupRule { id: "error-reports", label: "Windows Error Reporting archive", description: "Archived and queued error reports.", risk: "safe", requires_elevation: false, discovery: "walk WER\\ReportArchive, ReportQueue", execution: "delete report files" },
    CleanupRule { id: "recycle-bin", label: "Recycle Bin", description: "Items you deleted but haven't emptied. Last chance to restore — review first.", risk: "review", requires_elevation: false, discovery: "Shell.Application NameSpace(0xA) sizes", execution: "Clear-RecycleBin -Force" },
];

fn older_than(meta: &std::fs::Metadata, days: u64) -> bool {
    meta.modified().map(|m| SystemTime::now().duration_since(m).map(|d| d > Duration::from_secs(days * 86400)).unwrap_or(false)).unwrap_or(false)
}

/// Path suffixes each rule is allowed to operate on. A rule root must END with
/// one of these (case-insensitive) — so a misconfigured %TEMP% pointing at a
/// drive root, Documents, or anything unexpected is refused outright.
fn allowed_suffixes(id: &str) -> &'static [&'static str] {
    match id {
        "user-temp" => &["\\temp", "\\tmp"],
        "windows-temp" => &["\\windows\\temp"],
        "shader-cache" => &["\\nvidia\\dxcache", "\\d3dscache", "\\amd\\dxcache"],
        "crash-dumps" => &["\\crashdumps"],
        "error-reports" => &["\\wer\\reportarchive", "\\wer\\reportqueue"],
        _ => &[],
    }
}

/// Pure root validation: canonical-looking path, expected suffix, never a drive
/// root or shallower than 3 components, never UNC.
pub fn validate_rule_root(id: &str, canonical: &Path) -> Result<(), String> {
    let s = canonical.to_string_lossy().to_lowercase();
    let s = s.trim_end_matches('\\').to_string();
    if s.starts_with("\\\\") {
        return Err("network paths are never cleaned".into());
    }
    let comps: Vec<&str> = s.split('\\').filter(|c| !c.is_empty()).collect();
    if comps.len() < 3 {
        return Err("path too shallow to be a cleanup root".into());
    }
    if s.contains("\\..") {
        return Err("relative segments are not allowed".into());
    }
    if !allowed_suffixes(id).iter().any(|suf| s.ends_with(suf)) {
        return Err(format!("{id} may not operate on this folder"));
    }
    Ok(())
}

fn candidate_roots(id: &str) -> Vec<PathBuf> {
    let la = env_path("LOCALAPPDATA");
    let sysroot = env_path("SystemRoot").unwrap_or_else(|| PathBuf::from(r"C:\Windows"));
    let v: Vec<Option<PathBuf>> = match id {
        "user-temp" => vec![env_path("TEMP")],
        "windows-temp" => vec![Some(sysroot.join("Temp"))],
        "shader-cache" => vec![la.as_ref().map(|l| l.join("NVIDIA").join("DXCache")), la.as_ref().map(|l| l.join("D3DSCache")), la.as_ref().map(|l| l.join("AMD").join("DxCache"))],
        "crash-dumps" => vec![la.as_ref().map(|l| l.join("CrashDumps"))],
        "error-reports" => vec![la.as_ref().map(|l| l.join("Microsoft").join("Windows").join("WER").join("ReportArchive")), la.as_ref().map(|l| l.join("Microsoft").join("Windows").join("WER").join("ReportQueue"))],
        _ => vec![],
    };
    v.into_iter().flatten().collect()
}

fn on_fixed_drive(p: &Path) -> bool {
    let disks = sysinfo::Disks::new_with_refreshed_list();
    let s = p.to_string_lossy().to_lowercase();
    let mut best: Option<(usize, bool)> = None;
    for d in disks.list() {
        let mp = d.mount_point().to_string_lossy().to_lowercase();
        let mp_t = mp.trim_end_matches('\\');
        if s.starts_with(mp_t) && best.map(|(l, _)| mp.len() > l).unwrap_or(true) {
            best = Some((mp.len(), !d.is_removable()));
        }
    }
    best.map(|(_, fixed)| fixed).unwrap_or(false)
}

/// Roots a rule may touch right now: exist, canonicalized, validated, on a fixed drive.
fn rule_paths(id: &str) -> Vec<PathBuf> {
    candidate_roots(id)
        .into_iter()
        .filter(|p| p.is_dir())
        .filter_map(|p| p.canonicalize().ok())
        .map(|p| crate::media::normalize(&p))
        .filter(|p| validate_rule_root(id, p).is_ok() && on_fixed_drive(p))
        .collect()
}

/// Walk `roots`, removing (or counting, when `dry_run`) files that pass
/// `filter`. Never follows reparse points, never removes directories, never
/// fails the whole run on a locked/denied/vanished file.
pub fn execute_rule(roots: &[PathBuf], filter: &dyn Fn(&Path, &std::fs::Metadata) -> bool, dry_run: bool) -> (u64, usize, usize) {
    let (mut freed, mut removed, mut skipped) = (0u64, 0usize, 0usize);
    for root in roots {
        let mut stack = vec![root.clone()];
        while let Some(dir) = stack.pop() {
            let Ok(rd) = std::fs::read_dir(&dir) else { skipped += 1; continue };
            for e in rd.flatten() {
                let p = e.path();
                let Ok(meta) = std::fs::symlink_metadata(&p) else { continue };
                if meta.file_type().is_symlink() {
                    continue;
                }
                if meta.is_dir() {
                    stack.push(p);
                    continue;
                }
                if !filter(&p, &meta) {
                    continue;
                }
                if dry_run {
                    freed += meta.len();
                    removed += 1;
                } else {
                    match std::fs::remove_file(&p) {
                        Ok(()) => {
                            freed += meta.len();
                            removed += 1;
                        }
                        Err(_) => skipped += 1,
                    }
                }
            }
        }
    }
    (freed, removed, skipped)
}

fn rule_filter(id: &str) -> Box<dyn Fn(&Path, &std::fs::Metadata) -> bool> {
    match id {
        "user-temp" | "windows-temp" => Box::new(|_, m| older_than(m, 7)),
        "crash-dumps" => Box::new(|p, _| p.extension().map(|e| e.eq_ignore_ascii_case("dmp")).unwrap_or(false)),
        _ => Box::new(|_, _| true),
    }
}

#[cfg(target_os = "windows")]
fn recycle_bin_size() -> Option<(u64, usize)> {
    use std::os::windows::process::CommandExt;
    let script = "$i=(New-Object -ComObject Shell.Application).NameSpace(0xA).Items(); $s=0; $n=0; foreach($x in $i){ $s+=$x.Size; $n++ }; \"$s $n\"";
    let out = std::process::Command::new(crate::system::powershell()).args(["-NoProfile", "-NonInteractive", "-Command", script]).creation_flags(0x08000000).output().ok()?;
    let t = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let mut it = t.split_whitespace();
    Some((it.next()?.parse().ok()?, it.next()?.parse().ok()?))
}
#[cfg(not(target_os = "windows"))]
fn recycle_bin_size() -> Option<(u64, usize)> {
    None
}

#[tauri::command]
pub fn cleanup_discover(state: tauri::State<StorageState>) -> Result<Vec<CleanupCandidate>, String> {
    let deadline = Instant::now() + Duration::from_secs(25);
    let mut out = Vec::new();
    for rule in RULES {
        if rule.id == "recycle-bin" {
            let (bytes, n) = recycle_bin_size().unwrap_or((0, 0));
            out.push(CleanupCandidate { rule: rule.clone(), bytes, file_count: n, accessible: true });
            continue;
        }
        let paths = rule_paths(rule.id);
        let filter = rule_filter(rule.id);
        let mut bytes = 0;
        let mut files = 0;
        for p in &paths {
            let s = walk_size(p, deadline, &state.cancel, &*filter);
            bytes += s.bytes;
            files += s.files;
        }
        out.push(CleanupCandidate { rule: rule.clone(), bytes, file_count: files, accessible: !paths.is_empty() });
    }
    Ok(out)
}

/// Execute approved rules. `dry_run` reports what WOULD be removed without
/// deleting anything. Only files matched by the rule's own filter are removed;
/// directories are never removed; locked/denied files are skipped and counted.
#[tauri::command]
pub fn cleanup_execute(rule_ids: Vec<String>, dry_run: bool) -> Result<Vec<CleanupReportItem>, String> {
    let mut report = Vec::new();
    for id in rule_ids {
        let Some(rule) = RULES.iter().find(|r| r.id == id) else {
            report.push(CleanupReportItem { rule_id: id, freed_bytes: 0, removed: 0, skipped: 0, dry_run, error: Some("unknown rule".into()) });
            continue;
        };
        if rule.id == "recycle-bin" {
            let (bytes, n) = recycle_bin_size().unwrap_or((0, 0));
            let mut err = None;
            if !dry_run {
                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    let r = std::process::Command::new(crate::system::powershell()).args(["-NoProfile", "-NonInteractive", "-Command", "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"]).creation_flags(0x08000000).output();
                    if r.is_err() {
                        err = Some("Clear-RecycleBin failed".into());
                    }
                }
            }
            report.push(CleanupReportItem { rule_id: id, freed_bytes: bytes, removed: n, skipped: 0, dry_run, error: err });
            continue;
        }
        let filter = rule_filter(rule.id);
        let roots = rule_paths(rule.id);
        let (freed, removed, skipped) = execute_rule(&roots, &*filter, dry_run);
        report.push(CleanupReportItem { rule_id: id, freed_bytes: freed, removed, skipped, dry_run, error: if roots.is_empty() { Some("no eligible folder".into()) } else { None } });
    }
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn walk_respects_filter_and_skips_nothing_plain() {
        let dir = std::env::temp_dir().join(format!("nexus-storage-fixture-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        std::fs::write(dir.join("a.dmp"), vec![0u8; 10]).unwrap();
        std::fs::write(dir.join("sub").join("b.txt"), vec![0u8; 5]).unwrap();
        let cancel = AtomicBool::new(false);
        let all = walk_size(&dir, Instant::now() + Duration::from_secs(5), &cancel, &|_, _| true);
        assert_eq!(all.files, 2);
        assert_eq!(all.bytes, 15);
        let dumps = walk_size(&dir, Instant::now() + Duration::from_secs(5), &cancel, &*rule_filter("crash-dumps"));
        assert_eq!(dumps.files, 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn every_rule_declares_risk_and_execution() {
        for r in RULES {
            assert!(["safe", "review"].contains(&r.risk));
            assert!(!r.execution.is_empty() && !r.discovery.is_empty());
            assert!(r.id == "recycle-bin" || !allowed_suffixes(r.id).is_empty(), "{} has no allowed roots", r.id);
        }
    }

    // ---- adversarial: a misconfigured environment must never widen the blast radius ----

    #[test]
    fn rejects_dangerous_cleanup_roots() {
        // drive roots, shallow paths, wrong folders, UNC, traversal
        assert!(validate_rule_root("user-temp", Path::new(r"D:\")).is_err());
        assert!(validate_rule_root("user-temp", Path::new(r"C:\Users")).is_err());
        assert!(validate_rule_root("user-temp", Path::new(r"C:\Users\joseph\Documents")).is_err());
        assert!(validate_rule_root("user-temp", Path::new(r"\\nas\share\Temp")).is_err());
        assert!(validate_rule_root("user-temp", Path::new(r"C:\Users\joseph\AppData\Local\Temp\..\..")).is_err());
        assert!(validate_rule_root("windows-temp", Path::new(r"C:\Windows")).is_err());
        assert!(validate_rule_root("windows-temp", Path::new(r"C:\Windows\System32")).is_err());
        assert!(validate_rule_root("crash-dumps", Path::new(r"X:\Videos")).is_err());
        // legitimate
        assert!(validate_rule_root("user-temp", Path::new(r"C:\Users\joseph\AppData\Local\Temp")).is_ok());
        assert!(validate_rule_root("windows-temp", Path::new(r"C:\Windows\Temp")).is_ok());
        assert!(validate_rule_root("shader-cache", Path::new(r"C:\Users\joseph\AppData\Local\NVIDIA\DXCache")).is_ok());
        assert!(validate_rule_root("error-reports", Path::new(r"C:\Users\joseph\AppData\Local\Microsoft\Windows\WER\ReportQueue")).is_ok());
    }

    fn fixture(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nexus-cleanup-{}-{}-{}", tag, std::process::id(), SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(dir.join("nested")).unwrap();
        std::fs::write(dir.join("old.dmp"), vec![0u8; 100]).unwrap();
        std::fs::write(dir.join("nested").join("deep.dmp"), vec![0u8; 50]).unwrap();
        std::fs::write(dir.join("keep.txt"), vec![0u8; 7]).unwrap();
        dir
    }

    #[test]
    fn dry_run_removes_nothing_and_reports_exact_bytes() {
        let dir = fixture("dry");
        let (freed, removed, skipped) = execute_rule(&[dir.clone()], &*rule_filter("crash-dumps"), true);
        assert_eq!((freed, removed, skipped), (150, 2, 0));
        assert!(dir.join("old.dmp").exists() && dir.join("nested").join("deep.dmp").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn execute_removes_only_matched_files_and_never_directories() {
        let dir = fixture("exec");
        let (freed, removed, _) = execute_rule(&[dir.clone()], &*rule_filter("crash-dumps"), false);
        assert_eq!((freed, removed), (150, 2));
        assert!(!dir.join("old.dmp").exists());
        assert!(dir.join("keep.txt").exists(), "unmatched file must survive");
        assert!(dir.join("nested").is_dir(), "directories are never removed");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn junction_inside_cleanup_root_is_not_followed() {
        let dir = fixture("junction");
        let outside = std::env::temp_dir().join(format!("nexus-cleanup-outside-{}", std::process::id()));
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(outside.join("precious.dmp"), vec![0u8; 9]).unwrap();
        let link = dir.join("link");
        let made = std::process::Command::new("cmd").args(["/C", "mklink", "/J", &link.to_string_lossy(), &outside.to_string_lossy()]).output().map(|o| o.status.success()).unwrap_or(false);
        if made {
            execute_rule(&[dir.clone()], &*rule_filter("crash-dumps"), false);
            assert!(outside.join("precious.dmp").exists(), "file behind a junction was deleted");
            let _ = std::fs::remove_dir(&link);
        }
        let _ = std::fs::remove_dir_all(&outside);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn vanished_file_and_missing_root_are_skipped_not_fatal() {
        let dir = fixture("vanish");
        let ghost = dir.join("ghost.dmp");
        // Filter that deletes the file underneath the executor before it tries to remove it.
        let filter = move |p: &Path, _: &std::fs::Metadata| {
            if p.file_name().map(|n| n == "old.dmp").unwrap_or(false) {
                let _ = std::fs::remove_file(p);
            }
            let _ = &ghost;
            p.extension().map(|e| e == "dmp").unwrap_or(false)
        };
        let missing = std::env::temp_dir().join("nexus-does-not-exist-root");
        let (_, removed, skipped) = execute_rule(&[missing, dir.clone()], &filter, false);
        assert_eq!(removed, 1, "deep.dmp");
        assert!(skipped >= 2, "missing root + vanished file are counted, not fatal");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
