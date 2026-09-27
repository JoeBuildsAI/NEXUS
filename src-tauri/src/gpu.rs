//! Vendor-neutral GPU telemetry.
//!
//! Utilization and dedicated-memory usage come from Windows performance
//! counters (`GPU Engine` / `GPU Adapter Memory`, the same source Task Manager
//! uses), keyed by adapter LUID. DXGI maps each LUID to a human name, dedicated
//! VRAM and the software-adapter flag. Temperature has no vendor-neutral source
//! and stays UNSUPPORTED — the capability model never invents a number.
//!
//! A persistent PDH query lives in app state; each telemetry poll collects once
//! (rate counters need two samples, so the first poll yields nothing).

use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GpuAdapter {
    /// `luid_0xHIGH_0xLOW` — matches PDH instance names.
    pub luid: String,
    pub name: String,
    pub dedicated_total_bytes: u64,
    pub software: bool,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct GpuSample {
    pub luid: String,
    /// Sum of 3D-engine utilization for this adapter, 0–100.
    pub utilization_3d: f64,
    /// Highest single engine-type utilization (copy/video/compute…), 0–100.
    pub utilization_max: f64,
    pub dedicated_used_bytes: u64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GpuTelemetryReport {
    pub supported: bool,
    pub adapters: Vec<GpuAdapter>,
    pub samples: Vec<GpuSample>,
    /// Which adapter NEXUS considers the gaming GPU (largest dedicated memory, non-software).
    pub primary_luid: Option<String>,
}

pub struct GpuState {
    inner: Mutex<Option<Sampler>>,
    adapters: Mutex<Option<Vec<GpuAdapter>>>,
    /// User-selected primary adapter (LUID), if any.
    preferred: Mutex<Option<String>>,
}

impl GpuState {
    pub fn new() -> Self {
        Self { inner: Mutex::new(None), adapters: Mutex::new(None), preferred: Mutex::new(None) }
    }

    pub fn set_preferred(&self, luid: Option<String>) {
        if let Ok(mut p) = self.preferred.lock() {
            *p = luid;
        }
    }

    /// One poll: returns adapters + latest samples. Never panics; on any PDH
    /// failure the report is `supported: false` with adapters still listed.
    pub fn report(&self) -> GpuTelemetryReport {
        let adapters = {
            let mut a = self.adapters.lock().ok();
            match a.as_deref_mut() {
                Some(slot) => slot.get_or_insert_with(enumerate_adapters).clone(),
                None => enumerate_adapters(),
            }
        };
        let samples = match self.inner.lock() {
            Ok(mut guard) => {
                if guard.is_none() {
                    *guard = Sampler::open();
                }
                guard.as_mut().map(|s| s.sample()).unwrap_or_default()
            }
            Err(_) => vec![],
        };
        let supported = self.inner.lock().map(|g| g.is_some()).unwrap_or(false);
        let preferred = self.preferred.lock().ok().and_then(|p| p.clone());
        GpuTelemetryReport { supported, primary_luid: choose_primary(&adapters, preferred.as_deref()), adapters, samples }
    }
}

/// Primary = user preference if it exists, else the non-software adapter with
/// the most dedicated memory (discrete beats integrated), else the first.
pub fn choose_primary(adapters: &[GpuAdapter], preferred: Option<&str>) -> Option<String> {
    if let Some(p) = preferred {
        if adapters.iter().any(|a| a.luid == p) {
            return Some(p.to_string());
        }
    }
    adapters
        .iter()
        .filter(|a| !a.software)
        .max_by_key(|a| a.dedicated_total_bytes)
        .or_else(|| adapters.first())
        .map(|a| a.luid.clone())
}

/// Parse a PDH instance name like `pid_1234_luid_0x00000000_0x0000E5A3_phys_0_eng_3_engtype_3D`.
pub fn parse_engine_instance(instance: &str) -> Option<(String, String)> {
    let luid_idx = instance.find("luid_")?;
    let rest = &instance[luid_idx..];
    let mut parts = rest.split('_');
    let _ = parts.next()?; // "luid"
    let high = parts.next()?;
    let low = parts.next()?;
    let luid = format!("luid_{}_{}", high, low);
    let engtype = instance.find("engtype_").map(|i| instance[i + "engtype_".len()..].to_string()).unwrap_or_default();
    Some((luid, engtype))
}

/// Parse `luid_0x00000000_0x0000E5A3_phys_0` (GPU Adapter Memory instance).
pub fn parse_memory_instance(instance: &str) -> Option<String> {
    parse_engine_instance(instance).map(|(l, _)| l)
}

// ------------------------------------------------------------------ Windows

#[cfg(target_os = "windows")]
fn enumerate_adapters() -> Vec<GpuAdapter> {
    use windows::Win32::Graphics::Dxgi::{CreateDXGIFactory1, IDXGIFactory1, DXGI_ADAPTER_FLAG_SOFTWARE};
    let mut out = Vec::new();
    let factory: IDXGIFactory1 = match unsafe { CreateDXGIFactory1() } {
        Ok(f) => f,
        Err(_) => return out,
    };
    let mut i = 0u32;
    while let Ok(adapter) = unsafe { factory.EnumAdapters1(i) } {
        i += 1;
        let Ok(desc) = (unsafe { adapter.GetDesc1() }) else { continue };
        let name = String::from_utf16_lossy(&desc.Description).trim_end_matches('\0').trim().to_string();
        let luid = format!("luid_0x{:08X}_0x{:08X}", desc.AdapterLuid.HighPart as u32, desc.AdapterLuid.LowPart);
        let software = (desc.Flags & DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32) != 0 || name.to_lowercase().contains("microsoft basic render");
        out.push(GpuAdapter { luid, name, dedicated_total_bytes: desc.DedicatedVideoMemory as u64, software });
        if i > 16 {
            break;
        }
    }
    out
}

#[cfg(not(target_os = "windows"))]
fn enumerate_adapters() -> Vec<GpuAdapter> {
    vec![]
}

#[cfg(target_os = "windows")]
struct Sampler {
    query: windows::Win32::System::Performance::PDH_HQUERY,
    engine: windows::Win32::System::Performance::PDH_HCOUNTER,
    memory: windows::Win32::System::Performance::PDH_HCOUNTER,
}

// PDH handles are process-local opaque pointers; the sampler lives behind a Mutex.
#[cfg(target_os = "windows")]
unsafe impl Send for Sampler {}

#[cfg(target_os = "windows")]
impl Sampler {
    fn open() -> Option<Self> {
        use windows::core::w;
        use windows::Win32::System::Performance::{PdhAddEnglishCounterW, PdhCollectQueryData, PdhOpenQueryW, PDH_HCOUNTER, PDH_HQUERY};
        let mut query = PDH_HQUERY::default();
        if unsafe { PdhOpenQueryW(None, 0, &mut query) } != 0 {
            return None;
        }
        let mut engine = PDH_HCOUNTER::default();
        let mut memory = PDH_HCOUNTER::default();
        if unsafe { PdhAddEnglishCounterW(query, w!("\\GPU Engine(*)\\Utilization Percentage"), 0, &mut engine) } != 0 {
            return None;
        }
        if unsafe { PdhAddEnglishCounterW(query, w!("\\GPU Adapter Memory(*)\\Dedicated Usage"), 0, &mut memory) } != 0 {
            return None;
        }
        // Prime the query so the next sample has a delta.
        let _ = unsafe { PdhCollectQueryData(query) };
        Some(Self { query, engine, memory })
    }

    fn sample(&mut self) -> Vec<GpuSample> {
        use windows::Win32::System::Performance::PdhCollectQueryData;
        if unsafe { PdhCollectQueryData(self.query) } != 0 {
            return vec![];
        }
        let mut by_luid: HashMap<String, GpuSample> = HashMap::new();
        for (instance, value) in read_array(self.engine) {
            let Some((luid, engtype)) = parse_engine_instance(&instance) else { continue };
            let e = by_luid.entry(luid.clone()).or_insert_with(|| GpuSample { luid, ..Default::default() });
            if engtype.eq_ignore_ascii_case("3D") {
                e.utilization_3d += value;
            }
            if value > e.utilization_max {
                e.utilization_max = value;
            }
        }
        for (instance, value) in read_array(self.memory) {
            let Some(luid) = parse_memory_instance(&instance) else { continue };
            let e = by_luid.entry(luid.clone()).or_insert_with(|| GpuSample { luid, ..Default::default() });
            e.dedicated_used_bytes += value.max(0.0) as u64;
        }
        let mut v: Vec<GpuSample> = by_luid.into_values().collect();
        for s in &mut v {
            s.utilization_3d = s.utilization_3d.clamp(0.0, 100.0);
            s.utilization_max = s.utilization_max.clamp(0.0, 100.0);
        }
        v
    }
}

#[cfg(target_os = "windows")]
impl Drop for Sampler {
    fn drop(&mut self) {
        use windows::Win32::System::Performance::PdhCloseQuery;
        let _ = unsafe { PdhCloseQuery(self.query) };
    }
}

/// Read a wildcard counter as (instance name, double) pairs.
#[cfg(target_os = "windows")]
fn read_array(counter: windows::Win32::System::Performance::PDH_HCOUNTER) -> Vec<(String, f64)> {
    use windows::Win32::System::Performance::{PdhGetFormattedCounterArrayW, PDH_FMT, PDH_FMT_COUNTERVALUE_ITEM_W, PDH_FMT_DOUBLE};
    // PDH_FMT_NOCAP100 (0x8000) lets multi-engine sums exceed 100 before we clamp.
    let fmt = PDH_FMT(PDH_FMT_DOUBLE.0 | 0x8000);
    let mut size: u32 = 0;
    let mut count: u32 = 0;
    // First call sizes the buffer (PDH_MORE_DATA), second fills it.
    let _ = unsafe { PdhGetFormattedCounterArrayW(counter, fmt, &mut size, &mut count, None) };
    if size == 0 {
        return vec![];
    }
    let mut buf = vec![0u8; size as usize + 64];
    let status = unsafe { PdhGetFormattedCounterArrayW(counter, fmt, &mut size, &mut count, Some(buf.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W)) };
    if status != 0 {
        return vec![];
    }
    let items = unsafe { std::slice::from_raw_parts(buf.as_ptr() as *const PDH_FMT_COUNTERVALUE_ITEM_W, count as usize) };
    items
        .iter()
        .filter_map(|it| {
            let name = unsafe { it.szName.to_string() }.ok()?;
            let value = unsafe { it.FmtValue.Anonymous.doubleValue };
            Some((name, value))
        })
        .collect()
}

#[cfg(not(target_os = "windows"))]
struct Sampler;
#[cfg(not(target_os = "windows"))]
impl Sampler {
    fn open() -> Option<Self> {
        None
    }
    fn sample(&mut self) -> Vec<GpuSample> {
        vec![]
    }
}

#[tauri::command]
pub fn gpu_set_preferred(state: tauri::State<GpuState>, luid: Option<String>) -> Result<(), String> {
    state.set_preferred(luid.filter(|l| l.starts_with("luid_") && l.len() < 40));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_pdh_instance_names() {
        let (luid, eng) = parse_engine_instance("pid_1234_luid_0x00000000_0x0000E5A3_phys_0_eng_3_engtype_3D").unwrap();
        assert_eq!(luid, "luid_0x00000000_0x0000E5A3");
        assert_eq!(eng, "3D");
        let (luid2, eng2) = parse_engine_instance("pid_9_luid_0x00000000_0x00012ABC_phys_0_eng_0_engtype_VideoDecode").unwrap();
        assert_eq!(luid2, "luid_0x00000000_0x00012ABC");
        assert_eq!(eng2, "VideoDecode");
        assert_eq!(parse_memory_instance("luid_0x00000000_0x0000E5A3_phys_0").as_deref(), Some("luid_0x00000000_0x0000E5A3"));
        assert!(parse_engine_instance("garbage").is_none());
    }

    #[test]
    fn primary_prefers_discrete_over_integrated_regardless_of_order() {
        let igpu = GpuAdapter { luid: "luid_a".into(), name: "AMD Radeon(TM) Graphics".into(), dedicated_total_bytes: 512 << 20, software: false };
        let dgpu = GpuAdapter { luid: "luid_b".into(), name: "NVIDIA GeForce RTX 5090".into(), dedicated_total_bytes: 32 << 30, software: false };
        let sw = GpuAdapter { luid: "luid_c".into(), name: "Microsoft Basic Render Driver".into(), dedicated_total_bytes: 64 << 40, software: true };
        assert_eq!(choose_primary(&[igpu.clone(), dgpu.clone(), sw.clone()], None).as_deref(), Some("luid_b"));
        assert_eq!(choose_primary(&[igpu.clone(), dgpu.clone()], Some("luid_a")).as_deref(), Some("luid_a"), "manual preference wins");
        assert_eq!(choose_primary(&[igpu.clone(), dgpu], Some("luid_zzz")).as_deref(), Some("luid_b"), "stale preference ignored");
        assert_eq!(choose_primary(&[sw.clone()], None).as_deref(), Some("luid_c"), "software-only machine still reports something");
        assert_eq!(choose_primary(&[], None), None);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn live_report_never_panics_and_stays_honest() {
        let state = GpuState::new();
        let first = state.report();
        std::thread::sleep(std::time::Duration::from_millis(400));
        let second = state.report();
        // Adapters come from DXGI; samples from PDH (may be empty on CI without a GPU).
        assert!(first.adapters.len() <= 16);
        for s in &second.samples {
            assert!((0.0..=100.0).contains(&s.utilization_3d));
        }
        if !second.adapters.is_empty() {
            assert!(second.primary_luid.is_some());
        }
    }
}

#[cfg(all(test, target_os = "windows"))]
mod probe {
    #[test]
    #[ignore]
    fn print_live_report() {
        let state = super::GpuState::new();
        let _ = state.report();
        std::thread::sleep(std::time::Duration::from_millis(1200));
        let r = state.report();
        println!("{}", serde_json::to_string_pretty(&r).unwrap());
    }
}
