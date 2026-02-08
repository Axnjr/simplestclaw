mod config;
mod sidecar;

use sidecar::SidecarManager;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Initialize sidecar manager
            app.manage(SidecarManager::default());
            Ok(())
        })
        .on_window_event(|window, event| {
            // Stop the gateway when the window is closed
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(manager) = window.app_handle().try_state::<SidecarManager>() {
                    let _ = manager.stop();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            config::get_config,
            config::set_api_key,
            config::has_api_key,
            sidecar::start_gateway,
            sidecar::stop_gateway,
            sidecar::get_gateway_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
