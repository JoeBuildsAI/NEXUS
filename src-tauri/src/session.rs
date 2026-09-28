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

/// Parse a session record; tolerant of a UTF-8 BOM (editors / PowerShell add one).
pub fn parse_record(text: &str) -> Option<SessionRecord> {
    serde_json::from_str(text.trim_start_matches('\u{feff}')).ok()
}

#[tauri::command]
pub fn session_read(app: tauri::AppHandle) -> Result<Option<SessionRecord>, String> {
    let p = file(&app)?;
    if !p.exists() {
        return Ok(None);
    }
    let text = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    match parse_record(&text) {
        Some(r) => Ok(Some(r)),
        None => {
            // Never leave an unreadable record in place forever: move it aside so
            // the next session starts clean and the evidence is kept locally.
            let _ = std::fs::rename(&p, p.with_file_name("session.invalid.json"));
            Err("session record was unreadable and has been set aside".into())
        }
    }
}

#[tauri::command]
pub fn session_write(app: tauri::AppHandle, record: SessionRecord) -> Result<(), String> {
    let p = file(&app)?;
    let text = serde_json::to_string_pretty(&record).map_err(|e| e.to_string())?;
    std::fs::write(&p, text).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_records_with_or_without_bom_and_rejects_garbage() {
        let json = r#"{"mode":"gaming","startedAt":1,"previousPowerGuid":"381b4222-f694-41f0-9685-ff5bb260df2e","closedApps":[],"startupChanges":[]}"#;
        assert_eq!(parse_record(json).unwrap().mode, "gaming");
        assert!(parse_record(&format!("\u{feff}{json}")).unwrap().previous_power_guid.is_some());
        assert!(parse_record("{not json").is_none());
    }
}

#[tauri::command]
pub fn session_clear(app: tauri::AppHandle) -> Result<(), String> {
    let p = file(&app)?;
    if p.exists() {
        std::fs::remove_file(&p).map_err(|e| e.to_string())?;
    }
    Ok(())
}
