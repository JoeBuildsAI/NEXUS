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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupApp {
    id: String,
    name: String,
    publisher: Option<String>,
    command: String,
    enabled: bool,
    impact: String,
}

/// READ-ONLY enumeration of startup entries from the standard Run keys and the
/// per-user/all-users Startup folders. NEXUS never writes to these keys.
#[cfg(target_os = "windows")]
#[tauri::command]
pub fn get_startup_apps() -> Result<Vec<StartupApp>, String> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    let mut out: Vec<StartupApp> = Vec::new();
    let sources: [(winreg::HKEY, &str, &str); 3] = [
        (HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", "hkcu"),
        (HKEY_LOCAL_MACHINE, r"Software\Microsoft\Windows\CurrentVersion\Run", "hklm"),
        (HKEY_LOCAL_MACHINE, r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run", "hklm32"),
    ];

    for (root, path, tag) in sources {
        let Ok(key) = RegKey::predef(root).open_subkey_with_flags(path, KEY_READ) else { continue };
        // Approved/disabled state lives in StartupApproved; read it if present.
        let approved = RegKey::predef(root)
            .open_subkey_with_flags(
                r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run",
                KEY_READ,
            )
            .ok();
        for (name, value) in key.enum_values().flatten() {
            let command = value.to_string();
            // StartupApproved stores a 12-byte blob; first byte 0x02/0x06 = enabled, 0x03 = disabled.
            let enabled = approved
                .as_ref()
                .and_then(|a| a.get_raw_value(&name).ok())
                .map(|v| v.bytes.first().map(|b| *b != 3).unwrap_or(true))
                .unwrap_or(true);
            out.push(StartupApp {
                id: format!("{tag}:{name}"),
                name: name.clone(),
                publisher: None,
                command: command.clone(),
                enabled,
                impact: estimate_impact(&command),
            });
        }
    }

    // Startup folders (shortcuts).
    let mut folders = Vec::new();
    if let Ok(ad) = std::env::var("APPDATA") {
        folders.push(std::path::PathBuf::from(ad).join(r"Microsoft\Windows\Start Menu\Programs\Startup"));
    }
    if let Ok(pd) = std::env::var("ProgramData") {
        folders.push(std::path::PathBuf::from(pd).join(r"Microsoft\Windows\Start Menu\Programs\StartUp"));
    }
    for dir in folders {
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            let p = e.path();
            if p.is_file() && p.file_name().map(|n| n != "desktop.ini").unwrap_or(false) {
                let name = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
                out.push(StartupApp {
                    id: format!("folder:{name}"),
                    name,
                    publisher: None,
                    command: p.to_string_lossy().to_string(),
                    enabled: true,
                    impact: "unknown".into(),
                });
            }
        }
    }

    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn get_startup_apps() -> Result<Vec<StartupApp>, String> {
    Err("startup enumeration is Windows-only".into())
}

fn estimate_impact(command: &str) -> String {
    let c = command.to_lowercase();
    if ["discord", "steam", "epicgames", "teams", "onedrive", "dropbox"].iter().any(|k| c.contains(k)) {
        "medium".into()
    } else if ["nvidia", "realtek", "securityhealth", "ctfmon"].iter().any(|k| c.contains(k)) {
        "low".into()
    } else {
        "unknown".into()
    }
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
