//! The desktop app's shell (desktop-app D1): it registers the plugins and nothing of its own. The app's logic is
//! TypeScript in the webview; what it may reach is the capability file's allow-list. The window comes back at the size,
//! place and state it was closed in (window-state); only its decorations stay the config's (off on Linux, where the
//! app draws its own window buttons).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        - tauri_plugin_window_state::StateFlags::DECORATIONS,
                )
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("the chess app failed to start");
}
