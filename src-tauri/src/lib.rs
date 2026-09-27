mod apps;
mod gpu;
mod hardware;
mod media;
mod media_thumbs;
mod oauth;
mod secrets;
mod session;
mod state;
mod steam;
mod steam_api;
mod storage;
mod system;
mod telemetry;

use apps::AppRegistry;
use state::{AppState, CloseBehavior};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .manage(AppState::new())
        .manage(AppRegistry::new())
        .manage(media::MediaState::new())
        .manage(storage::StorageState::new())
        .manage(hardware::HardwareCache(std::sync::Mutex::new(None)))
        .manage(steam_api::ApiCache::new())
        .manage(gpu::GpuState::new())
        .manage(oauth::OAuthState::new())
        .setup(|app| {
            setup_tray(app.handle())?;
            if let Some(w) = app.get_webview_window("main") {
                ensure_on_screen(&w);
                if std::env::args().any(|a| a == "--minimized") {
                    let _ = w.hide();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Close button: minimize-to-tray (default) or exit, per user setting.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let behavior = window.state::<AppState>().close_behavior.lock().map(|b| *b).unwrap_or(CloseBehavior::Tray);
                if behavior == CloseBehavior::Tray {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            telemetry::get_telemetry,
            telemetry::get_drives,
            system::get_processes,
            system::get_startup_apps,
            system::startup_set_enabled,
            system::open_external,
            system::process_close_graceful,
            system::process_running_under,
            system::power_get_state,
            system::power_set_active,
            system::set_close_behavior,
            system::exit_app,
            apps::discover_apps,
            apps::launch_app,
            steam::steam_discover,
            steam::steam_local_artwork,
            steam::steam_launch,
            steam_api::steam_api_get,
            secrets::secret_set,
            secrets::secret_delete,
            secrets::secret_status,
            oauth::oauth_status,
            oauth::oauth_begin,
            oauth::oauth_disconnect,
            oauth::mail_api,
            media::media_register_root,
            media::media_revoke_root,
            media::media_root_status,
            media::media_file_exists,
            media::media_scan_root,
            media::media_cancel_scan,
            media_thumbs::media_thumbnail,
            media_thumbs::media_purge_thumbnails,
            hardware::get_hardware,
            gpu::gpu_set_preferred,
            session::session_read,
            session::session_write,
            session::session_clear,
            storage::storage_analyze,
            storage::storage_cancel,
            storage::cleanup_discover,
            storage::cleanup_execute,
        ])
        .run(tauri::generate_context!())
        .expect("error while running NEXUS");
}

/// If a restored window position no longer intersects any monitor (topology
/// changed since last run), center it on the primary monitor instead.
fn ensure_on_screen(w: &tauri::WebviewWindow) {
    let (Ok(pos), Ok(size), Ok(monitors)) = (w.outer_position(), w.outer_size(), w.available_monitors()) else { return };
    if monitors.is_empty() {
        return;
    }
    let (x, y, wdt, hgt) = (pos.x as i64, pos.y as i64, size.width as i64, size.height as i64);
    let visible = monitors.iter().any(|m| {
        let (mx, my) = (m.position().x as i64, m.position().y as i64);
        let (mw, mh) = (m.size().width as i64, m.size().height as i64);
        // Require at least a 120x80 px overlap so the titlebar is reachable.
        let ox = (x + wdt).min(mx + mw) - x.max(mx);
        let oy = (y + hgt).min(my + mh) - y.max(my);
        ox >= 120 && oy >= 80
    });
    if !visible {
        let _ = w.center();
    }
}

fn setup_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "show", "Open NEXUS", true, None::<&str>)?;
    let gaming = MenuItem::with_id(app, "mode:gaming", "Gaming Mode", true, None::<&str>)?;
    let normal = MenuItem::with_id(app, "mode:normal", "Normal Mode", true, None::<&str>)?;
    let privacy = MenuItem::with_id(app, "privacy", "Privacy", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Exit NEXUS", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open, &sep1, &gaming, &normal, &privacy, &sep2, &quit])?;

    TrayIconBuilder::with_id("nexus-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("NEXUS")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "quit" => app.exit(0),
            other => {
                // Mode/privacy actions are executed by the frontend action registry.
                show_main(app);
                let _ = app.emit("nexus:tray", other.to_string());
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}
