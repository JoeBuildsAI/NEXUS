mod apps;
mod hardware;
mod media;
mod secrets;
mod session;
mod state;
mod steam;
mod steam_api;
mod storage;
mod system;
mod telemetry;

use apps::AppRegistry;
use state::AppState;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
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
        .setup(|app| {
            setup_tray(app.handle())?;
            if std::env::args().any(|a| a == "--minimized") {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Minimize-to-tray: intercept close and hide instead of exiting.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
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
            apps::discover_apps,
            apps::launch_app,
            steam::steam_discover,
            steam::steam_local_artwork,
            steam::steam_launch,
            steam_api::steam_api_get,
            secrets::secret_set,
            secrets::secret_delete,
            secrets::secret_status,
            media::media_register_root,
            media::media_revoke_root,
            media::media_root_status,
            media::media_file_exists,
            media::media_scan_root,
            media::media_cancel_scan,
            hardware::get_hardware,
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

fn setup_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Open NEXUS", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit NEXUS", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &hide, &quit])?;

    TrayIconBuilder::with_id("nexus-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("NEXUS")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "hide" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
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
