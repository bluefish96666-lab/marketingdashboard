use crate::config::{self, Config};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub fn load_config(app: AppHandle) -> Config {
    config::load(&app)
}

#[tauri::command]
pub fn save_config(app: AppHandle, server_url: String) -> Result<(), String> {
    let cfg = Config { server_url };
    config::save(&app, &cfg)?;
    Ok(())
}

#[tauri::command]
pub fn reload_app(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let url = if cfg!(debug_assertions) {
            Config::dev_url()
        } else {
            config::load(&app).main_url()
        };
        let _ = w.navigate(url.parse().unwrap());
    }
}

#[tauri::command]
pub fn open_settings(app: AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.set_focus();
        return;
    }

    let url = if cfg!(debug_assertions) {
        "http://localhost:3000/desktop-settings.html"
    } else {
        "tauri://localhost/desktop-settings.html"
    };

    let _ = WebviewWindowBuilder::new(&app, "settings", WebviewUrl::External(url.parse().unwrap()))
        .title("服务器设置")
        .inner_size(460.0, 320.0)
        .resizable(false)
        .center()
        .build();
}
