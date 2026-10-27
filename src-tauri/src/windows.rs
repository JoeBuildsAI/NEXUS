//! Independent player windows (like Windows Photos).
//!
//! Every window is its own WebView document with its own playback state.
//! Windows get unique labels (`main`, `player-1`, `player-2`, …) and are
//! created on demand: Ctrl+N, "Open in new window", Explorer "Open with" and
//! launching NEXUS again (forwarded by the single-instance plugin). There is no
//! software window limit. The app exits when the last window closes.
//!
//! A file meant for a new window is handed over through `pending` keyed by
//! label (never through the URL), and claimed once by that window.

use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

const DEFAULT_W: f64 = 1280.0;
const DEFAULT_H: f64 = 800.0;
const CASCADE_STEP: f64 = 32.0;
const CASCADE_SLOTS: u64 = 8;

#[derive(Default)]
pub struct WindowState {
    next: AtomicU64,
    pending: Mutex<HashMap<String, String>>,
}

impl WindowState {
    pub fn set_pending(&self, label: &str, file: String) {
        if let Ok(mut p) = self.pending.lock() {
            p.insert(label.to_string(), file);
        }
    }
    pub fn take_pending(&self, label: &str) -> Option<String> {
        self.pending.lock().ok()?.remove(label)
    }
    pub fn next_label(&self) -> (String, u64) {
        let n = self.next.fetch_add(1, Ordering::Relaxed) + 1;
        (format!("player-{n}"), n)
    }
}

/// Video paths among command-line arguments (Explorer may pass several).
pub fn video_args<I: IntoIterator<Item = String>>(args: I) -> Vec<String> {
    args.into_iter()
        .filter(|a| !a.starts_with('-'))
        .filter(|a| crate::library::video_ext(Path::new(a)).is_some() && Path::new(a).is_file())
        .collect()
}

/// Logical position for the n-th new window: offset from the window the user
/// is working in, cycling through a few slots so windows never fully overlap.
pub fn cascade(anchor: Option<(f64, f64)>, n: u64) -> Option<(f64, f64)> {
    let (x, y) = anchor?;
    let k = (n % CASCADE_SLOTS) as f64 + 1.0;
    Some((x + CASCADE_STEP * k, y + CASCADE_STEP * k))
}

fn anchor(app: &tauri::AppHandle) -> Option<(f64, f64)> {
    let windows = app.webview_windows();
    let w = windows.values().find(|w| w.is_focused().unwrap_or(false)).or_else(|| windows.values().next())?;
    if w.is_fullscreen().unwrap_or(false) || w.is_maximized().unwrap_or(false) {
        // Anchor to the monitor's work area instead of a full-screen window's corner.
        let m = w.current_monitor().ok().flatten()?;
        let s = m.scale_factor();
        return Some((m.position().x as f64 / s + 40.0, m.position().y as f64 / s + 40.0));
    }
    let s = w.scale_factor().ok()?;
    let p = w.outer_position().ok()?;
    Some((p.x as f64 / s, p.y as f64 / s))
}

/// Create a new, focused player window; optionally hand it a file to open.
pub fn open_window(app: &tauri::AppHandle, file: Option<String>) -> Result<String, String> {
    let state = app.state::<WindowState>();
    let (label, n) = state.next_label();
    if let Some(f) = file {
        state.set_pending(&label, f);
    }
    let mut b = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
        .title("NEXUS")
        .inner_size(DEFAULT_W, DEFAULT_H)
        .min_inner_size(720.0, 480.0)
        .decorations(false)
        .resizable(true)
        .background_color(tauri::window::Color(0, 0, 0, 255))
        .focused(true)
        .visible(true);
    b = match cascade(anchor(app), n) {
        Some((x, y)) => b.position(x, y),
        None => b.center(),
    };
    let w = b.build().map_err(|e| e.to_string())?;
    crate::ensure_on_screen(&w);
    let _ = w.set_focus();
    Ok(label)
}

/// Async on purpose: building a window inside a synchronous command deadlocks
/// the event loop on Windows (WebView2 creation needs it to keep pumping).
#[tauri::command]
pub async fn new_window(app: tauri::AppHandle, file: Option<String>) -> Result<String, String> {
    open_window(&app, file)
}

/// The file this window was created for (Explorer, Open with, new window); once.
#[tauri::command]
pub fn take_initial_file(window: tauri::WebviewWindow, state: tauri::State<WindowState>) -> Option<String> {
    state.take_pending(window.label())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_are_unique_and_pending_files_are_claimed_once() {
        let s = WindowState::default();
        let (a, _) = s.next_label();
        let (b, _) = s.next_label();
        assert_ne!(a, b);
        s.set_pending(&a, "x.mp4".into());
        assert_eq!(s.take_pending(&b), None);
        assert_eq!(s.take_pending(&a).as_deref(), Some("x.mp4"));
        assert_eq!(s.take_pending(&a), None);
    }

    #[test]
    fn cascade_offsets_cycle_and_never_stack_exactly() {
        let a = (100.0, 100.0);
        let p1 = cascade(Some(a), 1).unwrap();
        let p2 = cascade(Some(a), 2).unwrap();
        assert_ne!(p1, p2);
        assert_ne!(p1, a);
        assert_eq!(cascade(Some(a), 1), cascade(Some(a), 1 + CASCADE_SLOTS));
        assert_eq!(cascade(None, 3), None);
    }

    #[test]
    fn only_existing_video_files_are_taken_from_arguments() {
        let d = std::env::temp_dir().join(format!("nexus-args-{}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        let v = d.join("a.mp4");
        std::fs::write(&v, b"x").unwrap();
        let args = vec!["nexus.exe".into(), "--flag".into(), v.to_string_lossy().to_string(), d.join("missing.mp4").to_string_lossy().to_string(), d.join("notes.txt").to_string_lossy().to_string()];
        assert_eq!(video_args(args.into_iter().skip(1)), vec![v.to_string_lossy().to_string()]);
        let _ = std::fs::remove_dir_all(d);
    }
}
