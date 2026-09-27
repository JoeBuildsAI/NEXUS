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

#[cfg(target_os = "windows")]
fn query_gpus() -> Vec<GpuCapability> {
    use std::os::windows::process::CommandExt;
    // Read-only WMI query. AdapterRAM is a 32-bit field in WMI and unreliable
    // above 4 GB, so we prefer the registry-backed qwMemorySize when present.
    let script = r#"
$gpus = Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM, DriverVersion, PNPDeviceID
$out = @()
foreach ($g in $gpus) {
  $vram = $null
  try {
    $key = Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}' -ErrorAction SilentlyContinue |
      Where-Object { (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).MatchingDeviceId -and $g.PNPDeviceID -like ("*" + (Get-ItemProperty $_.PSPath).MatchingDeviceId + "*") } | Select-Object -First 1
    if ($key) { $q = (Get-ItemProperty $key.PSPath -ErrorAction SilentlyContinue).'HardwareInformation.qwMemorySize'; if ($q) { $vram = [int64]$q } }
  } catch {}
  if (-not $vram -and $g.AdapterRAM) { $vram = [int64]$g.AdapterRAM }
  $out += [pscustomobject]@{ name = $g.Name; vram = $vram; driver = $g.DriverVersion }
}
$out | ConvertTo-Json -Compress
"#;
    let out = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script])
        .creation_flags(0x08000000)
        .output();
    let Ok(out) = out else { return vec![] };
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if text.is_empty() {
        return vec![];
    }
    let parsed: serde_json::Value = match serde_json::from_str(&text) {
        Ok(v) => v,
        Err(_) => return vec![],
    };
    let items: Vec<serde_json::Value> = match parsed {
        serde_json::Value::Array(a) => a,
        v @ serde_json::Value::Object(_) => vec![v],
        _ => vec![],
    };
    items
        .into_iter()
        .filter_map(|v| {
            let name = v.get("name")?.as_str()?.to_string();
            // Skip virtual/remote display adapters.
            if name.to_lowercase().contains("remote") || name.to_lowercase().contains("virtual") {
                return None;
            }
            let vram = v.get("vram").and_then(|x| x.as_i64()).filter(|x| *x > 0).map(|x| (x as u64) / (1024 * 1024));
            let driver = v.get("driver").and_then(|x| x.as_str()).map(|s| s.to_string());
            Some(GpuCapability {
                name: Some(name),
                vram_total_mb: vram,
                driver_version: driver,
                utilization_supported: false,
                temperature_supported: false,
                memory_supported: false,
            })
        })
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
        cpu_name: sys.cpus().first().map(|c| c.brand().trim().to_string()).unwrap_or_else(|| "CPU".into()),
        logical_cores: sys.cpus().len(),
        physical_cores: sys.physical_core_count(),
        total_memory_bytes: sys.total_memory(),
        os_name: System::name().unwrap_or_else(|| "Windows".into()),
        os_version: System::long_os_version().or_else(System::os_version).unwrap_or_default(),
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
            assert!(!g.utilization_supported && !g.temperature_supported && !g.memory_supported);
            assert!(g.name.as_deref().map(|n| !n.is_empty()).unwrap_or(false));
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
