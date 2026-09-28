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

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GpuTelemetry {
    luid: String,
    name: String,
    usage_percent: u8,
    memory_used_mb: u64,
    memory_total_mb: u64,
    /// No vendor-neutral source; always None. The capability model says so.
    temperature_c: Option<f32>,
    software: bool,
    primary: bool,
}

/// Build per-adapter telemetry from the PDH/DXGI report (pure; tested).
pub fn gpu_telemetry_from(report: &crate::gpu::GpuTelemetryReport) -> Vec<GpuTelemetry> {
    report
        .adapters
        .iter()
        .filter(|a| !a.software)
        .map(|a| {
            let s = report.samples.iter().find(|s| s.luid == a.luid);
            GpuTelemetry {
                luid: a.luid.clone(),
                name: a.name.clone(),
                usage_percent: s.map(|s| s.utilization_3d.max(s.utilization_max * 0.0).round() as u8).unwrap_or(0),
                memory_used_mb: s.map(|s| s.dedicated_used_bytes / (1024 * 1024)).unwrap_or(0),
                memory_total_mb: a.dedicated_total_bytes / (1024 * 1024),
                temperature_c: None,
                software: a.software,
                primary: report.primary_luid.as_deref() == Some(a.luid.as_str()),
            }
        })
        .collect()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetrySnapshot {
    timestamp: u64,
    cpu: CpuTelemetry,
    gpu: Option<GpuTelemetry>,
    /// Every adapter with live counters (multi-GPU); `gpu` is the primary one.
    gpu_adapters: Vec<GpuTelemetry>,
    memory: MemoryTelemetry,
    storage: Vec<DriveInfo>,
    network: NetworkTelemetry,
    uptime_seconds: u64,
    process_count: usize,
    health: String,
}

/// "13th Gen Intel(R) Core(TM) i7-13700K" → "13th Gen Intel Core i7-13700K".
pub fn clean_cpu_name(brand: &str) -> String {
    let s = brand.replace("(R)", "").replace("(r)", "").replace("(TM)", "").replace("(tm)", "");
    let s = s.split(" @ ").next().unwrap_or(&s).replace(" CPU", "");
    let out = s.split_whitespace().filter(|w| !w.eq_ignore_ascii_case("processor")).collect::<Vec<_>>().join(" ");
    if out.is_empty() { brand.trim().to_string() } else { out }
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
pub fn get_telemetry(state: State<AppState>, gpu_state: State<crate::gpu::GpuState>) -> Result<TelemetrySnapshot, String> {
    let mut sys = state.sys.lock().map_err(|e| e.to_string())?;
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    // Only the count is needed here: refresh the process list without per-process CPU/memory/exe work.
    sys.refresh_processes_specifics(sysinfo::ProcessesToUpdate::All, true, sysinfo::ProcessRefreshKind::new());
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
        .map(|c| clean_cpu_name(c.brand()))
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
    // Label the adapter carrying the most traffic since the last poll (map order is arbitrary).
    let mut busiest: Option<(u64, String)> = None;
    for (name, data) in networks.iter() {
        total_rx += data.total_received();
        total_tx += data.total_transmitted();
        let recent = data.received() + data.transmitted();
        if data.total_received() > 0 && busiest.as_ref().map_or(true, |(b, _)| recent > *b) {
            busiest = Some((recent, name.clone()));
        }
    }
    let iface = busiest.map(|(_, n)| n);
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

    // GPU: vendor-neutral counters; None when unsupported (never invented).
    let gpu_report = gpu_state.report();
    let gpu_adapters = if gpu_report.supported { gpu_telemetry_from(&gpu_report) } else { vec![] };
    let gpu_primary = gpu_adapters.iter().find(|g| g.primary).cloned();

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
        gpu: gpu_primary.clone(),
        gpu_adapters,
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

#[cfg(test)]
mod tests {
    use super::clean_cpu_name;

    #[test]
    fn cpu_names_drop_trademark_noise() {
        assert_eq!(clean_cpu_name("13th Gen Intel(R) Core(TM) i7-13700K"), "13th Gen Intel Core i7-13700K");
        assert_eq!(clean_cpu_name("Intel(R) Core(TM) i7-8700K CPU @ 3.70GHz"), "Intel Core i7-8700K");
        assert_eq!(clean_cpu_name("AMD Ryzen 9 7950X 16-Core Processor           "), "AMD Ryzen 9 7950X 16-Core");
        assert_eq!(clean_cpu_name("  "), "");
    }
}
