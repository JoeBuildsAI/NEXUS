//! OS-wide privacy hotkey, owned by the native layer.
//!
//! A shortcut registered from JavaScript keeps a callback channel into the page
//! that registered it; after a WebView reload (F5, dev reload) the OS still
//! reports it registered but presses go nowhere. Registering here and emitting
//! `nexus:privacy-hotkey` survives reloads and fires even before the UI loads.

use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// Same curated set the UI offers (src/lib/hotkeys.ts PRIVACY_HOTKEY_CHOICES).
pub const ALLOWED: &[&str] = &["CommandOrControl+Shift+`", "CommandOrControl+Shift+P", "CommandOrControl+Alt+P", "Alt+Shift+P", "F9", "F10"];

#[derive(Default)]
pub struct HotkeyState(Mutex<Option<String>>);

pub fn validate(accel: &str) -> Result<(), String> {
    if ALLOWED.contains(&accel) { Ok(()) } else { Err("unsupported privacy hotkey".into()) }
}

/// Register (or re-confirm) the privacy hotkey. Idempotent: the current
/// registration is kept; a different accelerator replaces it.
#[tauri::command]
pub fn privacy_hotkey_set(app: AppHandle, state: State<HotkeyState>, accelerator: String) -> Result<bool, String> {
    validate(&accelerator)?;
    let gs = app.global_shortcut();
    let mut current = state.0.lock().map_err(|e| e.to_string())?;
    if current.as_deref() == Some(accelerator.as_str()) && gs.is_registered(accelerator.as_str()) {
        return Ok(true);
    }
    if let Some(prev) = current.take() {
        let _ = gs.unregister(prev.as_str());
    }
    gs.on_shortcut(accelerator.as_str(), |app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            let _ = app.emit("nexus:privacy-hotkey", ());
        }
    })
    .map_err(|e| e.to_string())?;
    *current = Some(accelerator);
    Ok(true)
}

#[tauri::command]
pub fn privacy_hotkey_status(app: AppHandle) -> Option<String> {
    let current = app.state::<HotkeyState>().0.lock().ok()?.clone()?;
    app.global_shortcut().is_registered(current.as_str()).then_some(current)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_curated_accelerators_are_accepted() {
        assert!(validate("CommandOrControl+Shift+`").is_ok());
        assert!(validate("F9").is_ok());
        assert!(validate("A").is_err());
        assert!(validate("Ctrl+Alt+Delete").is_err());
        assert!(validate("").is_err());
    }
}
