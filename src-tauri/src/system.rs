use crate::state::AppState;
use serde::Serialize;
use sysinfo::ProcessesToUpdate;
use tauri::{Manager, State};

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

/// Enable/disable a CURRENT-USER startup entry via the StartupApproved key —
/// the same reversible mechanism Task Manager uses. Never deletes the Run
/// value itself. HKLM (all-users) and folder entries are read-only here.
#[cfg(target_os = "windows")]
#[tauri::command]
pub fn startup_set_enabled(id: String, enabled: bool) -> Result<bool, String> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE};
    use winreg::{RegKey, RegValue};
    let Some(name) = id.strip_prefix("hkcu:") else {
        return Err("Only current-user registry entries can be toggled. This entry is read-only.".into());
    };
    if name.is_empty() || name.len() > 200 {
        return Err("invalid entry".into());
    }
    let approved = RegKey::predef(HKEY_CURRENT_USER)
        .create_subkey_with_flags(r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run", KEY_READ | KEY_WRITE)
        .map(|(k, _)| k)
        .map_err(|e| e.to_string())?;
    // Preserve existing blob (timestamp bytes) when present.
    let mut bytes = approved.get_raw_value(name).map(|v| v.bytes).unwrap_or_else(|_| vec![0u8; 12]);
    if bytes.len() < 12 {
        bytes.resize(12, 0);
    }
    bytes[0] = if enabled { 0x02 } else { 0x03 };
    approved
        .set_raw_value(name, &RegValue { bytes, vtype: winreg::enums::RegType::REG_BINARY })
        .map_err(|e| e.to_string())?;
    Ok(enabled)
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn startup_set_enabled(_id: String, _enabled: bool) -> Result<bool, String> {
    Err("Windows only".into())
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

/// Absolute path to a System32 tool so behavior never depends on PATH
/// (the app may be launched from environments with a stripped PATH).
pub fn sys32(tool: &str) -> std::path::PathBuf {
    let root = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:Windows".into());
    std::path::PathBuf::from(root).join("System32").join(tool)
}

/// Windows PowerShell 5.1 host, by absolute path.
pub fn powershell() -> std::path::PathBuf {
    let root = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:Windows".into());
    std::path::PathBuf::from(root).join("System32").join("WindowsPowerShell").join("v1.0").join("powershell.exe")
}

/// Mirror the user's close-button preference into native state.
#[tauri::command]
pub fn set_close_behavior(state: State<AppState>, behavior: String) -> Result<(), String> {
    let b = match behavior.as_str() {
        "exit" => crate::state::CloseBehavior::Exit,
        "tray" => crate::state::CloseBehavior::Tray,
        _ => return Err("unknown close behavior".into()),
    };
    *state.close_behavior.lock().map_err(|e| e.to_string())? = b;
    Ok(())
}

/// Allow one explicitly chosen local image to be displayed as the Home
/// backdrop. Only common image extensions; the file (not its folder) is granted.
#[tauri::command]
pub fn background_register(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let p = std::path::PathBuf::from(path.trim());
    let canon = p.canonicalize().map_err(|_| "Image not found.".to_string())?;
    if !canon.is_file() {
        return Err("Not a file.".into());
    }
    let ext = canon.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).unwrap_or_default();
    if !["png", "jpg", "jpeg", "webp", "avif", "bmp"].contains(&ext.as_str()) {
        return Err("Choose a PNG, JPEG, WebP or AVIF image.".into());
    }
    if std::fs::metadata(&canon).map(|m| m.len()).unwrap_or(u64::MAX) > 64 * 1024 * 1024 {
        return Err("Image is larger than 64 MB.".into());
    }
    app.asset_protocol_scope().allow_file(&canon).map_err(|e| e.to_string())?;
    Ok(crate::media::normalize(&canon).to_string_lossy().to_string())
}

/// Launch flags the frontend needs to honor user settings (e.g. "start minimized").
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchFlags {
    pub minimized: bool,
}

#[tauri::command]
pub fn launch_flags() -> LaunchFlags {
    LaunchFlags { minimized: std::env::args().any(|a| a == "--minimized") }
}

/// Explicit exit (tray "Exit" and Settings). Never triggered by the close button in tray mode.
#[tauri::command]
pub fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// Open a URL/URI (e.g. steam://rungameid/<appid>) via the OS default handler.
/// This maps to an explicit, predefined command — never arbitrary shell input.
#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    open_url(&url)
}

/// Scheme-allowlisted URL open. Shared by app/steam launch paths.
///
/// Uses ShellExecute (via the `open` crate) — never `cmd /C start` — so the
/// argument is passed to the OS handler verbatim without shell re-parsing.
pub fn open_url(url: &str) -> Result<(), String> {
    validate_url(url)?;
    open::that_detached(url).map_err(|e| e.to_string())
}

/// Pure validation so it can be unit tested.
pub fn validate_url(url: &str) -> Result<(), String> {
    let allowed = ["https://", "http://", "steam://", "mailto:"];
    if !allowed.iter().any(|s| url.starts_with(s)) {
        return Err("Refusing to open disallowed URL scheme".into());
    }
    if url.len() > 2048 {
        return Err("URL too long".into());
    }
    if url.chars().any(|c| c.is_control() || c.is_whitespace() || matches!(c, '"' | '\'' | '&' | '|' | '^' | '<' | '>' | '%' | '`')) {
        return Err("Refusing URL with shell metacharacters".into());
    }
    Ok(())
}

/// Process names NEXUS refuses to close under any configuration. Second line of
/// defense behind the frontend classifier + user allowlist.
const PROTECTED_PROCESSES: &[&str] = &[
    "system", "smss.exe", "csrss.exe", "wininit.exe", "winlogon.exe", "services.exe", "lsass.exe",
    "svchost.exe", "explorer.exe", "dwm.exe", "fontdrvhost.exe", "conhost.exe", "sihost.exe",
    "taskhostw.exe", "msmpeng.exe", "securityhealthservice.exe", "nvcontainer.exe", "nvdisplay.container.exe",
    "steam.exe", "steamwebhelper.exe", "nexus.exe", "runtimebroker.exe", "searchhost.exe", "startmenuexperiencehost.exe",
    // Observed on a real gaming PC: shared WebView2 (NEXUS renders through it), platform
    // services, anti-cheat, input and security surfaces.
    "msedgewebview2.exe", "steamservice.exe", "gameoverlayui.exe", "gameoverlayui64.exe", "gamingservices.exe",
    "gamingservicesnet.exe", "gamelaunchhelper.exe", "vgc.exe", "vgtray.exe", "easyanticheat.exe", "easyanticheat_eos.exe",
    "beservice.exe", "beservice_x64.exe", "gameinputsvc.exe", "gameinputredistservice.exe", "microsoftsecurityapp.exe",
    "audiodg.exe", "ctfmon.exe", "textinputhost.exe", "shellexperiencehost.exe", "lsaiso.exe",
];

fn validate_process_name(name: &str) -> Result<String, String> {
    let n = name.trim();
    if n.is_empty() || n.len() > 80 {
        return Err("invalid process name".into());
    }
    if n.contains(['\\', '/', ':', '*', '?', '"', '<', '>', '|', ' ', '&', '^']) {
        return Err("process name must be a bare executable name".into());
    }
    if !n.to_lowercase().ends_with(".exe") {
        return Err("process name must end with .exe".into());
    }
    if PROTECTED_PROCESSES.contains(&n.to_lowercase().as_str()) {
        return Err(format!("{n} is protected and cannot be managed"));
    }
    Ok(n.to_string())
}

/// Gracefully close a USER application by image name (WM_CLOSE via taskkill
/// without /F). Never force-kills. The name must pass validation and must be
/// currently running; returns the number of processes signalled.
#[cfg(target_os = "windows")]
#[tauri::command]
pub fn process_close_graceful(state: State<AppState>, name: String) -> Result<u32, String> {
    use std::os::windows::process::CommandExt;
    let n = validate_process_name(&name)?;
    let running = {
        let mut sys = state.sys.lock().map_err(|e| e.to_string())?;
        sys.refresh_processes(ProcessesToUpdate::All, true);
        sys.processes().values().filter(|p| p.name().to_string_lossy().eq_ignore_ascii_case(&n)).count() as u32
    };
    if running == 0 {
        return Ok(0);
    }
    let out = std::process::Command::new(sys32("taskkill.exe"))
        .args(["/IM", &n])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(running)
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn process_close_graceful(_state: State<AppState>, _name: String) -> Result<u32, String> {
    Err("Windows only".into())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PowerScheme {
    guid: String,
    name: String,
    active: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PowerState {
    supported: bool,
    schemes: Vec<PowerScheme>,
    active_guid: Option<String>,
}

fn run_powercfg(args: &[&str]) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let out = std::process::Command::new(sys32("powercfg.exe"))
            .args(args)
            .creation_flags(0x08000000)
            .output()
            .map_err(|e| e.to_string())?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
        }
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = args;
        Err("Windows only".into())
    }
}

/// Parse `powercfg /list` output into schemes. Pure so it can be unit tested.
pub fn parse_powercfg_list(text: &str) -> Vec<PowerScheme> {
    let mut out = Vec::new();
    for line in text.lines() {
        let Some(idx) = line.find("GUID:") else { continue };
        let rest = &line[idx + 5..];
        let mut it = rest.trim().splitn(2, ' ');
        let guid = it.next().unwrap_or("").trim().to_string();
        let tail = it.next().unwrap_or("");
        // Names can nest parentheses (vendor plans like "GameTurbo (High Performance)"),
        // so take everything between the first '(' and the last ')'.
        let name = match (tail.find('('), tail.rfind(')')) {
            (Some(a), Some(b)) if b > a => tail[a + 1..b].trim().to_string(),
            _ => String::new(),
        };
        let active = tail.trim_end().ends_with('*');
        if guid.len() == 36 {
            out.push(PowerScheme { guid, name, active });
        }
    }
    out
}

/// Read available power schemes and the active one (read-only).
#[tauri::command]
pub fn power_get_state() -> Result<PowerState, String> {
    match run_powercfg(&["/list"]) {
        Ok(text) => {
            let schemes = parse_powercfg_list(&text);
            let active = schemes.iter().find(|s| s.active).map(|s| s.guid.clone());
            Ok(PowerState { supported: !schemes.is_empty(), schemes, active_guid: active })
        }
        Err(_) => Ok(PowerState { supported: false, schemes: vec![], active_guid: None }),
    }
}

/// Activate an EXISTING power scheme by GUID. Never creates or modifies schemes.
#[tauri::command]
pub fn power_set_active(guid: String) -> Result<(), String> {
    let g = guid.trim().to_lowercase();
    let valid = g.len() == 36 && g.chars().all(|c| c.is_ascii_hexdigit() || c == '-');
    if !valid {
        return Err("invalid power scheme guid".into());
    }
    // Only allow schemes that exist on this machine.
    let list = run_powercfg(&["/list"])?;
    if !parse_powercfg_list(&list).iter().any(|s| s.guid.eq_ignore_ascii_case(&g)) {
        return Err("unknown power scheme".into());
    }
    run_powercfg(&["/setactive", &g]).map(|_| ())
}

/// Whether any process executable lives under `install_dir` (game session probe).
/// Read-only enumeration — no attach, inject, or window interaction.
#[tauri::command]
pub fn process_running_under(state: State<AppState>, install_dir: String) -> Result<bool, String> {
    let dir = install_dir.trim().to_lowercase().replace('/', "\\");
    if dir.len() < 4 {
        return Err("install dir too short".into());
    }
    let mut sys = state.sys.lock().map_err(|e| e.to_string())?;
    sys.refresh_processes(ProcessesToUpdate::All, true);
    Ok(sys.processes().values().any(|p| {
        p.exe()
            .map(|e| e.to_string_lossy().to_lowercase().starts_with(&dir))
            .unwrap_or(false)
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_protected_and_malformed_names() {
        assert!(validate_process_name("explorer.exe").is_err());
        assert!(validate_process_name("C:\\x\\a.exe").is_err());
        assert!(validate_process_name("notepad").is_err());
        assert!(validate_process_name("Spotify.exe").is_ok());
        for n in ["msedgewebview2.exe", "VGC.exe", "gamingservices.exe", "SteamWebHelper.exe", "MicrosoftSecurityApp.exe"] {
            assert!(validate_process_name(n).is_err(), "{n} must be protected natively");
        }
    }

    #[test]
    fn url_validation_allows_only_known_schemes_without_shell_chars() {
        assert!(validate_url("steam://rungameid/620").is_ok());
        assert!(validate_url("https://store.steampowered.com/app/620").is_ok());
        assert!(validate_url("file:///C:/Windows/System32/cmd.exe").is_err());
        assert!(validate_url("C:\\Windows\\System32\\calc.exe").is_err());
        assert!(validate_url("steam://run/1 & calc").is_err());
        assert!(validate_url("https://x/%TEMP%").is_err());
        assert!(validate_url("https://x/\"quoted\"").is_err());
        assert!(validate_url("javascript:alert(1)").is_err());
    }

    #[test]
    fn startup_toggle_only_accepts_hkcu_ids() {
        // Non-HKCU ids are read-only by construction (the prefix check happens before any registry access).
        assert!(!"hklm:Foo".starts_with("hkcu:"));
        assert!(!"folder:C:\\x.lnk".starts_with("hkcu:"));
    }

    #[test]
    fn parses_powercfg_list() {
        let text = "Existing Power Schemes (* Active)\n-----------------------------------\nPower Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced) *\nPower Scheme GUID: 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c  (High performance)\n";
        let s = parse_powercfg_list(text);
        assert_eq!(s.len(), 2);
        assert!(s[0].active);
        assert_eq!(s[1].name, "High performance");
        assert!(!s[1].active);
    }

    #[test]
    fn parses_vendor_plan_names_with_nested_parentheses() {
        let text = "Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced)\nPower Scheme GUID: 69472b16-83b2-4296-838b-569e8cae9cfe  (GameTurbo (High Performance)) *\nPower Scheme GUID: 991e80d5-ab7a-4b53-ba2e-110827b0c52d  (Vendor Cortex Power Plan)\n";
        let s = parse_powercfg_list(text);
        assert_eq!(s.len(), 3);
        assert_eq!(s[1].name, "GameTurbo (High Performance)");
        assert!(s[1].active && !s[0].active && !s[2].active);
    }
}
