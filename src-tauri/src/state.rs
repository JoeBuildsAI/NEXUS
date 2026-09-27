use std::sync::Mutex;
use std::time::Instant;
use sysinfo::{Networks, System};

/// What the titlebar close button does. Mirrors the frontend window setting.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum CloseBehavior {
    Tray,
    Exit,
}

/// Shared, long-lived system inspection state.
///
/// Keeping a persistent `System` lets us compute CPU usage and network rates
/// from the delta between polls (the frontend polls ~every 1.5s) without
/// blocking on a sleep in each command.
pub struct AppState {
    pub sys: Mutex<System>,
    pub networks: Mutex<Networks>,
    /// (last_sample_instant, total_received_bytes, total_transmitted_bytes)
    pub last_net: Mutex<Option<(Instant, u64, u64)>>,
    pub close_behavior: Mutex<CloseBehavior>,
}

impl AppState {
    pub fn new() -> Self {
        let mut sys = System::new_all();
        sys.refresh_all();
        Self {
            sys: Mutex::new(sys),
            networks: Mutex::new(Networks::new_with_refreshed_list()),
            last_net: Mutex::new(None),
            close_behavior: Mutex::new(CloseBehavior::Tray),
        }
    }
}
