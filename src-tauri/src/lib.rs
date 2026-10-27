mod library;
mod thumbs;
mod windows;

use tauri::Manager;

/// NEXUS — a local, high-definition video player: one video per window with
/// precise A–B loop markers, repeat, and the other videos of the same folder
/// (with real thumbnails) one click away. Any number of independent windows.
/// Everything stays on this machine.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be first: a second launch (Explorer "Open with", Start menu) is
        // forwarded here and becomes a new window instead of a second process.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let files = windows::video_args(argv.into_iter().skip(1));
            if files.is_empty() {
                let _ = windows::open_window(app, None);
            }
            for f in files {
                let _ = windows::open_window(app, Some(f));
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        // Only the first window's geometry is remembered; extra windows cascade.
        .plugin(tauri_plugin_window_state::Builder::new().with_filter(|label| label == "main").build())
        .manage(library::LibraryState::default())
        .manage(windows::WindowState::default())
        .manage(thumbs::ThumbState::default())
        .setup(|app| {
            if let Some(w) = app.get_webview_window("main") {
                ensure_on_screen(&w);
            }
            // Explorer may pass several files: the first plays in the main window, the rest get their own.
            let mut files = windows::video_args(std::env::args().skip(1)).into_iter();
            if let Some(first) = files.next() {
                app.state::<windows::WindowState>().set_pending("main", first);
            }
            for f in files {
                let _ = windows::open_window(app.handle(), Some(f));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            library::open_video,
            library::open_folder,
            library::refresh_folder,
            windows::new_window,
            windows::take_initial_file,
            thumbs::video_thumbnail,
            thumbs::clear_thumbnails,
        ])
        .run(tauri::generate_context!())
        .expect("error while running NEXUS");
}

/// If a window position no longer intersects any monitor, re-center it.
pub(crate) fn ensure_on_screen(w: &tauri::WebviewWindow) {
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
