mod library;
mod thumbs;

use tauri::Manager;

/// NEXUS — a local, high-definition video player: one video at a time with
/// precise A–B loop markers, repeat, and the other videos of the same folder
/// (with real thumbnails) one click away. Everything stays on this machine.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .manage(library::LibraryState::default())
        .setup(|app| {
            if let Some(w) = app.get_webview_window("main") {
                ensure_on_screen(&w);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            library::open_video,
            library::open_folder,
            library::refresh_folder,
            library::launch_file,
            thumbs::video_thumbnail,
            thumbs::clear_thumbnails,
        ])
        .run(tauri::generate_context!())
        .expect("error while running NEXUS");
}

/// If a restored window position no longer intersects any monitor, re-center it.
fn ensure_on_screen(w: &tauri::WebviewWindow) {
    let (Ok(pos), Ok(size), Ok(monitors)) = (w.outer_position(), w.outer_size(), w.available_monitors()) else { return };
    if monitors.is_empty() {
        return;
    }
    let (x, y, wdt, hgt) = (pos.x as i64, pos.y as i64, size.width as i64, size.height as i64);
    let visible = monitors.iter().any(|m| {
        let (mx, my) = (m.position().x as i64, m.position().y as i64);
        let (mw, mh) = (m.size().width as i64, m.size().height as i64);
        let ox = (x + wdt).min(mx + mw) - x.max(mx);
        let oy = (y + hgt).min(my + mh) - y.max(my);
        ox >= 120 && oy >= 80
    });
    if !visible {
        let _ = w.center();
    }
}
