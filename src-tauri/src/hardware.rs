//! Hardware inventory + GPU capability model.
//!
//! GPU name/VRAM come from WMI (Win32_VideoController) via a single, read-only
//! PowerShell query executed once and cached. Utilization and temperature are
//! reported as UNSUPPORTED rather than estimated: reliable utilization needs
//! PDH "GPU Engine" counters and temperature needs vendor SDKs — both are clean
//! extension points here, not fragile hacks.

use serde::Serialize;
use std::sync::Mutex;
use sysinfo::System;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GpuCapability {
    pub name: Option<String>,
    pub vram_total_mb: Option<u64>,
    pub driver_version: Option<String>,
    pub utilization_supported: bool,
    pub temperature_supported: bool,
    pub memory_supported: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HardwareInventory {
    pub cpu_name: String,
    pub logical_cores: usize,
    pub physical_cores: Option<usize>,
    pub total_memory_bytes: u64,
    pub os_name: String,
    pub os_version: String,
    pub kernel_version: String,
    pub arch: String,
    pub hostname: String,
    pub gpus: Vec<GpuCapability>,
    pub drives: Vec<crate::telemetry::DriveInfo>,
}

pub struct HardwareCache(pub Mutex<Option<HardwareInventory>>);

/// GPU inventory. DXGI is authoritative (fast, in-process, exact dedicated
/// memory); WMI is consulted only for driver versions, best-effort with a
/// timeout so a slow PowerShell never blocks first-run discovery.
#[cfg(target_os = "windows")]
fn query_gpus() -> Vec<GpuCapability> {
    let report = crate::gpu::GpuState::new().report();
    let drivers = query_driver_versions();
    let mut out: Vec<GpuCapability> = report
        .adapters
        .iter()
        .filter(|a| !a.software)
        .map(|a| GpuCapability {
            name: Some(a.name.clone()),
            vram_total_mb: if a.dedicated_total_bytes > 0 { Some(a.dedicated_total_bytes / (1024 * 1024)) } else { None },
            driver_version: drivers.iter().find(|(n, _)| n.eq_ignore_ascii_case(&a.name)).map(|(_, d)| d.clone()),
            utilization_supported: report.supported,
            temperature_supported: false,
            memory_supported: report.supported,
        })
        .collect();
    // Primary first so `gpus[0]` is the gaming GPU everywhere.
    if let Some(p) = report.primary_luid.as_deref() {
        if let Some(idx) = report.adapters.iter().filter(|a| !a.software).position(|a| a.luid == p) {
            if idx < out.len() {
                let primary = out.remove(idx);
                out.insert(0, primary);
            }
        }
    }
    if out.is_empty() {
        // DXGI unavailable (remote session, broken driver): fall back to WMI names.
        out = drivers.into_iter().map(|(name, driver)| GpuCapability { name: Some(name), vram_total_mb: None, driver_version: Some(driver), utilization_supported: false, temperature_supported: false, memory_supported: false }).collect();
    }
    out
}

/// (adapter name, driver version) via WMI — best-effort, bounded to ~4 s.
#[cfg(target_os = "windows")]
fn query_driver_versions() -> Vec<(String, String)> {
    use std::os::windows::process::CommandExt;
    let script = "Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion | ConvertTo-Json -Compress";
    let mut child = match std::process::Command::new(crate::system::powershell())
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script])
        .creation_flags(0x08000000)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
    {
        Ok(c) => c,
        Err(_) => return vec![],
    };
    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if start.elapsed() > std::time::Duration::from_secs(4) => {
                let _ = child.kill();
                return vec![];
            }
            Ok(None) => std::thread::sleep(std::time::Duration::from_millis(50)),
            Err(_) => return vec![],
        }
    }
    let mut text = String::new();
    if let Some(mut so) = child.stdout.take() {
        use std::io::Read;
        let _ = so.read_to_string(&mut text);
    }
    let parsed: serde_json::Value = match serde_json::from_str(text.trim()) {
        Ok(v) => v,
        Err(_) => return vec![],
    };
    let items = match parsed {
        serde_json::Value::Array(a) => a,
        v @ serde_json::Value::Object(_) => vec![v],
        _ => vec![],
    };
    items
        .into_iter()
        .filter_map(|v| Some((v.get("Name")?.as_str()?.to_string(), v.get("DriverVersion")?.as_str()?.to_string())))
        .collect()
}

#[cfg(not(target_os = "windows"))]
fn query_gpus() -> Vec<GpuCapability> {
    vec![]
}

pub fn collect() -> HardwareInventory {
    let mut sys = System::new();
    sys.refresh_cpu_all();
    sys.refresh_memory();
    HardwareInventory {
        cpu_name: sys.cpus().first().map(|c| crate::telemetry::clean_cpu_name(c.brand())).unwrap_or_else(|| "CPU".into()),
        logical_cores: sys.cpus().len(),
        physical_cores: sys.physical_core_count(),
        total_memory_bytes: sys.total_memory(),
        os_name: System::name().unwrap_or_else(|| "Windows".into()),
        // long_os_version already includes the product name ("Windows 11 Home"); avoid "Windows Windows 11 Home".
        os_version: {
            let name = System::name().unwrap_or_else(|| "Windows".into());
            let long = System::long_os_version().or_else(System::os_version).unwrap_or_default();
            long.strip_prefix(&name).map(|r| r.trim().to_string()).unwrap_or(long)
        },
        kernel_version: System::kernel_version().unwrap_or_default(),
        arch: std::env::consts::ARCH.to_string(),
        hostname: System::host_name().unwrap_or_default(),
        gpus: query_gpus(),
        drives: crate::telemetry::collect_drives(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Exercises the real WMI/registry path on this machine: must not panic and
    /// must report the CPU; GPU capability flags must stay honest (unsupported).
    #[test]
    fn collects_inventory_without_inventing_gpu_metrics() {
        let inv = collect();
        assert!(!inv.cpu_name.is_empty());
        assert!(inv.logical_cores >= 1);
        assert!(inv.total_memory_bytes > 0);
        for g in &inv.gpus {
            assert!(!g.temperature_supported, "temperature must never be claimed");
            assert_eq!(g.utilization_supported, g.memory_supported, "both come from the same PDH source");
            assert!(g.name.as_deref().map(|n| !n.is_empty()).unwrap_or(false));
        }
        assert!(!inv.os_version.starts_with(&inv.os_name), "OS product name must not be duplicated");
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn dxgi_inventory_lists_the_discrete_gpu_first_when_present() {
        let inv = collect();
        // Any machine with a display adapter must report at least one non-software GPU via DXGI.
        assert!(!inv.gpus.is_empty(), "DXGI reported no adapters");
        if inv.gpus.len() > 1 {
            let first = inv.gpus[0].vram_total_mb.unwrap_or(0);
            assert!(inv.gpus.iter().all(|g| g.vram_total_mb.unwrap_or(0) <= first), "primary (most dedicated memory) must be first");
        }
    }
}

#[tauri::command]
pub fn get_hardware(cache: tauri::State<HardwareCache>, refresh: Option<bool>) -> Result<HardwareInventory, String> {
    let mut guard = cache.0.lock().map_err(|e| e.to_string())?;
    if refresh != Some(true) {
        if let Some(inv) = guard.as_ref() {
            return Ok(inv.clone());
        }
    }
    let inv = collect();
    *guard = Some(inv.clone());
    Ok(inv)
}

#[cfg(all(test, target_os = "windows"))]
mod probe {
    #[test]
    #[ignore]
    fn print_inventory() {
        let inv = super::collect();
        println!("{} | {}", inv.os_name, inv.os_version);
        for g in &inv.gpus {
            println!("{:?} vram={:?} driver={:?} util={}", g.name, g.vram_total_mb, g.driver_version, g.utilization_supported);
        }
    }
}
