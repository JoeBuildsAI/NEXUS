use crate::state::AppState;
use serde::Serialize;
use std::time::Instant;
use sysinfo::{Disks, System};
use tauri::State;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuTelemetry {
    usage_percent: u32,
    cores: usize,
    name: String,
    per_core: Vec<u32>,
    temperature_c: Option<i32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryTelemetry {
    used_bytes: u64,
    total_bytes: u64,
    usage_percent: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkTelemetry {
    down_bytes_per_sec: u64,
    up_bytes_per_sec: u64,
    online: bool,
    ssid_or_interface: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DriveInfo {
    mount_point: String,
    label: String,
    kind: String,
    total_bytes: u64,
    free_bytes: u64,
    file_system: Option<String>,
    eligible_for_scan: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetrySnapshot {
    timestamp: u64,
    cpu: CpuTelemetry,
    gpu: Option<serde_json::Value>,
    memory: MemoryTelemetry,
    storage: Vec<DriveInfo>,
    network: NetworkTelemetry,
    uptime_seconds: u64,
    process_count: usize,
    health: String,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn drive_kind(is_removable: bool) -> &'static str {
    if is_removable {
        "removable"
    } else {
        "fixed"
    }
}

pub fn collect_drives() -> Vec<DriveInfo> {
    let disks = Disks::new_with_refreshed_list();
    disks
        .list()
        .iter()
        .map(|d| {
            let removable = d.is_removable();
            DriveInfo {
                mount_point: d.mount_point().to_string_lossy().to_string(),
                label: {
                    let n = d.name().to_string_lossy().to_string();
                    if n.is_empty() {
                        "Local Disk".to_string()
                    } else {
                        n
                    }
                },
                kind: drive_kind(removable).to_string(),
                total_bytes: d.total_space(),
                free_bytes: d.available_space(),
                file_system: Some(d.file_system().to_string_lossy().to_string()),
                // SAFETY: removable drives are never eligible for automatic scan.
                eligible_for_scan: !removable,
            }
        })
        .collect()
}

#[tauri::command]
pub fn get_telemetry(state: State<AppState>) -> Result<TelemetrySnapshot, String> {
    let mut sys = state.sys.lock().map_err(|e| e.to_string())?;
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let process_count = sys.processes().len();

    let cpu_usage = sys.global_cpu_usage().round() as u32;
    let per_core: Vec<u32> = sys
        .cpus()
        .iter()
        .map(|c| c.cpu_usage().round() as u32)
        .collect();
    let cpu_name = sys
        .cpus()
        .first()
        .map(|c| c.brand().trim().to_string())
        .unwrap_or_else(|| "CPU".to_string());
    let cores = sys.cpus().len();

    let total_mem = sys.total_memory();
    let used_mem = sys.used_memory();
    let mem_percent = if total_mem > 0 {
        ((used_mem as f64 / total_mem as f64) * 100.0).round() as u32
    } else {
        0
    };

    // Network rate from delta since last poll.
    let mut networks = state.networks.lock().map_err(|e| e.to_string())?;
    networks.refresh();
    let (mut total_rx, mut total_tx) = (0u64, 0u64);
    let mut iface: Option<String> = None;
    for (name, data) in networks.iter() {
        total_rx += data.total_received();
        total_tx += data.total_transmitted();
        if iface.is_none() && data.total_received() > 0 {
            iface = Some(name.clone());
        }
    }
    let mut last = state.last_net.lock().map_err(|e| e.to_string())?;
    let (down_rate, up_rate) = match *last {
        Some((prev_t, prev_rx, prev_tx)) => {
            let secs = prev_t.elapsed().as_secs_f64().max(0.001);
            let d = ((total_rx.saturating_sub(prev_rx)) as f64 / secs) as u64;
            let u = ((total_tx.saturating_sub(prev_tx)) as f64 / secs) as u64;
            (d, u)
        }
        None => (0, 0),
    };
    *last = Some((Instant::now(), total_rx, total_tx));
    drop(last);
    drop(networks);

    let storage = collect_drives();

    // Non-scientific health heuristic.
    let ssd_pressure = storage.iter().any(|d| {
        d.kind == "fixed" && d.total_bytes > 0 && (d.free_bytes as f64 / d.total_bytes as f64) < 0.08
    });
    let health = if mem_percent > 90 {
        "high-memory"
    } else if ssd_pressure {
        "storage-pressure"
    } else if cpu_usage > 92 {
        "attention"
    } else {
        "nominal"
    };

    Ok(TelemetrySnapshot {
        timestamp: now_ms(),
        cpu: CpuTelemetry {
            usage_percent: cpu_usage,
            cores,
            name: cpu_name,
            per_core,
            temperature_c: None,
        },
        // GPU telemetry is not available via sysinfo; the frontend handles null.
        gpu: None,
        memory: MemoryTelemetry {
            used_bytes: used_mem,
            total_bytes: total_mem,
            usage_percent: mem_percent,
        },
        storage,
        network: NetworkTelemetry {
            down_bytes_per_sec: down_rate,
            up_bytes_per_sec: up_rate,
            online: true,
            ssid_or_interface: iface,
        },
        uptime_seconds: System::uptime(),
        process_count,
        health: health.to_string(),
    })
}

#[tauri::command]
pub fn get_drives() -> Result<Vec<DriveInfo>, String> {
    Ok(collect_drives())
}
