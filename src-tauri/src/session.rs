//! Recoverable session state for anything NEXUS changes temporarily (e.g. the
//! active power scheme during Gaming Mode). Persisted to the app data dir so a
//! crash never leaves Windows permanently altered: on next start the frontend
//! reads the stale record and restores it.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionRecord {
    pub mode: String,
    pub started_at: u64,
    pub previous_power_guid: Option<String>,
    pub closed_apps: Vec<String>,
    pub startup_changes: Vec<StartupChange>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StartupChange {
    pub id: String,
    pub previous_enabled: bool,
    pub changed_at: u64,
}

fn file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("session.json"))
}

#[tauri::command]
pub fn session_read(app: tauri::AppHandle) -> Result<Option<SessionRecord>, String> {
    let p = file(&app)?;
    if !p.exists() {
        return Ok(None);
    }
    let text = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    Ok(serde_json::from_str(&text).ok())
}

#[tauri::command]
pub fn session_write(app: tauri::AppHandle, record: SessionRecord) -> Result<(), String> {
    let p = file(&app)?;
    let text = serde_json::to_string_pretty(&record).map_err(|e| e.to_string())?;
    std::fs::write(&p, text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn session_clear(app: tauri::AppHandle) -> Result<(), String> {
    let p = file(&app)?;
    if p.exists() {
        std::fs::remove_file(&p).map_err(|e| e.to_string())?;
    }
    Ok(())
}
