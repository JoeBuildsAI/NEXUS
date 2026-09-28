//! Personal-data database (LIFE): migrations, paths, quarantine and backup
//! validation. The database holds PERSONAL rows (routines, fitness, nutrition,
//! calendar, tasks) — never secrets, tokens, email bodies or media paths.
//! Access from the WebView goes through tauri-plugin-sql; this module owns the
//! filesystem side that the plugin does not cover.

use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

pub const DB_NAME: &str = "life.db";
/// Connection string the frontend loads (relative to the app config dir).
pub const DB_URL: &str = "sqlite:life.db";

pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "life documents + meta",
            kind: MigrationKind::Up,
            sql: r#"
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS life_documents (
    collection TEXT NOT NULL,
    id         TEXT NOT NULL,
    day        TEXT,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    rev        INTEGER NOT NULL DEFAULT 1,
    demo       INTEGER NOT NULL DEFAULT 0,
    data       TEXT NOT NULL,
    PRIMARY KEY (collection, id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_life_day ON life_documents (collection, day);
CREATE INDEX IF NOT EXISTS idx_life_updated ON life_documents (collection, updated_at);
CREATE INDEX IF NOT EXISTS idx_life_deleted ON life_documents (collection, deleted_at);
CREATE TABLE IF NOT EXISTS life_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
INSERT OR IGNORE INTO life_meta (key, value) VALUES ('schema', '1');
INSERT OR IGNORE INTO life_meta (key, value) VALUES ('created_at', CAST(strftime('%s','now') AS TEXT));
"#,
        },
        Migration {
            version: 2,
            description: "settings kv (personal, non-secret) + change log for future sync",
            kind: MigrationKind::Up,
            sql: r#"
CREATE TABLE IF NOT EXISTS life_kv (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS life_changes (
    seq        INTEGER PRIMARY KEY AUTOINCREMENT,
    collection TEXT NOT NULL,
    id         TEXT NOT NULL,
    rev        INTEGER NOT NULL,
    at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_life_changes_at ON life_changes (at);
"#,
        },
    ]
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LifePaths {
    pub db_path: String,
    pub backup_dir: String,
    pub db_exists: bool,
    pub db_bytes: u64,
}

fn config_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_config_dir().map_err(|e| e.to_string())
}

/// Where the database and its backups live. Returned to the UI for display and
/// for `VACUUM INTO` targets — never a user-chosen arbitrary path.
#[tauri::command]
pub fn life_paths(app: tauri::AppHandle) -> Result<LifePaths, String> {
    let dir = config_dir(&app)?;
    let db = dir.join(DB_NAME);
    let backups = dir.join("backups");
    std::fs::create_dir_all(&backups).map_err(|e| e.to_string())?;
    let bytes = std::fs::metadata(&db).map(|m| m.len()).unwrap_or(0);
    Ok(LifePaths { db_path: db.to_string_lossy().to_string(), backup_dir: backups.to_string_lossy().to_string(), db_exists: db.exists(), db_bytes: bytes })
}

/// A backup file name inside the backup dir (timestamped, no user input).
#[tauri::command]
pub fn life_backup_target(app: tauri::AppHandle) -> Result<String, String> {
    let dir = config_dir(&app)?.join("backups");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(unique_backup_path(&dir, &chrono_like_stamp()).to_string_lossy().to_string())
}

/// VACUUM INTO refuses an existing file; two snapshots in the same second
/// (e.g. the safety snapshot right before a restore) get a numeric suffix.
pub fn unique_backup_path(dir: &std::path::Path, stamp: &str) -> std::path::PathBuf {
    let first = dir.join(format!("life-{stamp}.db"));
    if !first.exists() {
        return first;
    }
    (1..1000).map(|i| dir.join(format!("life-{stamp}-{i}.db"))).find(|p| !p.exists()).unwrap_or(first)
}

fn chrono_like_stamp() -> String {
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    // Simple civil-time conversion (UTC) without pulling in chrono.
    let days = secs / 86_400;
    let (y, m, d) = civil_from_days(days as i64);
    let rem = secs % 86_400;
    format!("{y:04}{m:02}{d:02}-{:02}{:02}{:02}", rem / 3600, (rem % 3600) / 60, rem % 60)
}
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupFile {
    pub path: String,
    pub name: String,
    pub bytes: u64,
    pub modified: u64,
}

#[tauri::command]
pub fn life_backups(app: tauri::AppHandle) -> Result<Vec<BackupFile>, String> {
    let dir = config_dir(&app)?.join("backups");
    let mut out = Vec::new();
    if let Ok(rd) = std::fs::read_dir(&dir) {
        for e in rd.flatten() {
            let p = e.path();
            if p.extension().and_then(|x| x.to_str()) != Some("db") {
                continue;
            }
            let Ok(meta) = e.metadata() else { continue };
            let modified = meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0);
            out.push(BackupFile { path: p.to_string_lossy().to_string(), name: p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(), bytes: meta.len(), modified });
        }
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(out)
}

/// Keep the newest `keep` scheduled backups.
#[tauri::command]
pub fn life_prune_backups(app: tauri::AppHandle, keep: usize) -> Result<usize, String> {
    let list = life_backups(app)?;
    let mut removed = 0;
    for b in list.into_iter().skip(keep.max(1)) {
        if std::fs::remove_file(&b.path).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

/// SQLite files start with this 16-byte header.
pub fn is_sqlite_file(path: &Path) -> bool {
    std::fs::read(path).map(|b| b.len() >= 16 && &b[..16] == b"SQLite format 3\0").unwrap_or(false)
}

/// Validate a restore candidate: must be an SQLite file inside the backup
/// directory (or explicitly chosen through the native dialog by the UI). The
/// row-level integrity check runs through the plugin (`PRAGMA integrity_check`
/// on the attached file) before any data is replaced.
#[tauri::command]
pub fn life_validate_backup(app: tauri::AppHandle, path: String) -> Result<bool, String> {
    let p = PathBuf::from(&path);
    if !p.is_file() {
        return Err("Backup file not found.".into());
    }
    if !is_sqlite_file(&p) {
        return Err("That file is not a NEXUS database.".into());
    }
    let dir = config_dir(&app)?.join("backups");
    let canon = std::fs::canonicalize(&p).map_err(|e| e.to_string())?;
    let inside = std::fs::canonicalize(&dir).map(|d| canon.starts_with(d)).unwrap_or(false);
    Ok(inside)
}

/// Move a corrupt database aside so a fresh one can be created. The UI closes
/// the plugin connection first. Never deletes — the file stays for recovery.
#[tauri::command]
pub fn life_quarantine(app: tauri::AppHandle) -> Result<String, String> {
    let dir = config_dir(&app)?;
    let db = dir.join(DB_NAME);
    if !db.exists() {
        return Err("No database to quarantine.".into());
    }
    let target = dir.join(format!("life.corrupt-{}.db", chrono_like_stamp()));
    quarantine_files(&db, &target)?;
    Ok(target.to_string_lossy().to_string())
}

/// Move the database and its WAL/SHM side files together. The WAL may hold the
/// newest committed transactions, so it is kept next to the quarantined file
/// (SQLite recovers `<name>-wal` automatically if the set is opened again).
pub fn quarantine_files(db: &Path, target: &Path) -> Result<(), String> {
    std::fs::rename(db, target).map_err(|e| e.to_string())?;
    for suffix in ["-wal", "-shm"] {
        let side = PathBuf::from(format!("{}{suffix}", db.to_string_lossy()));
        if side.exists() {
            let _ = std::fs::rename(&side, format!("{}{suffix}", target.to_string_lossy()));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quarantine_keeps_wal_and_shm_with_the_database() {
        let dir = std::env::temp_dir().join(format!("nexus-quar-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db = dir.join("life.db");
        for (p, b) in [(db.clone(), "db"), (dir.join("life.db-wal"), "wal"), (dir.join("life.db-shm"), "shm")] {
            std::fs::write(p, b).unwrap();
        }
        let target = dir.join("life.corrupt-x.db");
        quarantine_files(&db, &target).unwrap();
        assert!(!db.exists());
        assert_eq!(std::fs::read_to_string(dir.join("life.corrupt-x.db-wal")).unwrap(), "wal");
        assert_eq!(std::fs::read_to_string(dir.join("life.corrupt-x.db-shm")).unwrap(), "shm");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn backup_paths_never_collide_within_a_second() {
        let dir = std::env::temp_dir().join(format!("nexus-bk-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let a = unique_backup_path(&dir, "20260101-000000");
        std::fs::write(&a, b"x").unwrap();
        let b = unique_backup_path(&dir, "20260101-000000");
        assert_ne!(a, b);
        assert!(b.to_string_lossy().ends_with("life-20260101-000000-1.db"));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn migrations_are_ordered_and_idempotent_sql() {
        let m = migrations();
        assert_eq!(m.iter().map(|x| x.version).collect::<Vec<_>>(), vec![1, 2]);
        assert!(m.iter().all(|x| x.sql.contains("IF NOT EXISTS")));
    }

    #[test]
    fn sqlite_header_detection() {
        let dir = std::env::temp_dir().join(format!("nexus-life-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let good = dir.join("good.db");
        std::fs::write(&good, b"SQLite format 3\0rest").unwrap();
        let bad = dir.join("bad.db");
        std::fs::write(&bad, b"not a database").unwrap();
        assert!(is_sqlite_file(&good));
        assert!(!is_sqlite_file(&bad));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn civil_dates_are_correct() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(19_723), (2024, 1, 1));
        assert_eq!(civil_from_days(20_723), (2026, 9, 27));
    }
}
