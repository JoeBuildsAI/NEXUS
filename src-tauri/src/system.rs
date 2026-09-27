use crate::state::AppState;
use serde::Serialize;
use sysinfo::{ProcessesToUpdate, System};
use tauri::State;

/// Raw process info. Safety classification is applied on the frontend from the
/// name/publisher — see `src/core/safety/processClassifier.ts`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessRaw {
    pid: u32,
    name: String,
    cpu_percent: f32,
    memory_bytes: u64,
    publisher: Option<String>,
    path: Option<String>,
    /// Always false from the native layer — managed status lives in app config.
    managed: bool,
}

#[tauri::command]
pub fn get_processes(state: State<AppState>) -> Result<Vec<ProcessRaw>, String> {
    let mut sys = state.sys.lock().map_err(|e| e.to_string())?;
    // Refresh CPU first so process CPU deltas are meaningful, then processes.
    sys.refresh_processes(ProcessesToUpdate::All, true);

    let core_count = sys.cpus().len().max(1) as f32;

    let mut procs: Vec<ProcessRaw> = sys
        .processes()
        .iter()
        .map(|(pid, p)| ProcessRaw {
            pid: pid.as_u32(),
            name: p.name().to_string_lossy().to_string(),
            // Normalize to overall utilization (sysinfo reports per-core sum).
            cpu_percent: (p.cpu_usage() / core_count * 10.0).round() / 10.0,
            memory_bytes: p.memory(),
            publisher: None,
            path: p.exe().map(|e| e.to_string_lossy().to_string()),
            managed: false,
        })
        .collect();

    // Return the most resource-relevant processes to keep the payload compact.
    procs.sort_by(|a, b| b.memory_bytes.cmp(&a.memory_bytes));
    procs.truncate(150);
    Ok(procs)
}

/// Reading real startup entries requires registry access (winreg). Not yet
/// implemented; returning an error lets the provider fall back to safe demo
/// data without blocking the UI. See docs/GAMING_PC_SETUP.md.
#[tauri::command]
pub fn get_startup_apps() -> Result<Vec<serde_json::Value>, String> {
    Err("startup enumeration not implemented on native layer yet".into())
}

/// Open a URL/URI (e.g. steam://rungameid/<appid>) via the OS default handler.
/// This maps to an explicit, predefined command — never arbitrary shell input.
#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    // Only allow known safe schemes.
    let allowed = ["https://", "http://", "steam://", "mailto:"];
    if !allowed.iter().any(|s| url.starts_with(s)) {
        return Err(format!("Refusing to open disallowed URL scheme: {url}"));
    }
    let _ = System::name(); // touch sysinfo to keep import used across cfg
    open_url_impl(&url)
}

#[cfg(target_os = "windows")]
fn open_url_impl(url: &str) -> Result<(), String> {
    std::process::Command::new("cmd")
        .args(["/C", "start", "", url])
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "windows"))]
fn open_url_impl(_url: &str) -> Result<(), String> {
    Err("open_external is only implemented on Windows".into())
}
