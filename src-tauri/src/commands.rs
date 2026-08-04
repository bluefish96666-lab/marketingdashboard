use crate::config::{self, Config};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub fn load_config(app: AppHandle) -> Config {
    config::load(&app)
}

#[tauri::command]
pub fn save_config(app: AppHandle, mode: String, server_url: String) -> Result<(), String> {
    config::save(&app, &Config { mode, server_url })?;
    Ok(())
}

#[tauri::command]
pub fn reload_app(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        if cfg!(debug_assertions) {
            let _ = w.navigate(Config::dev_url().parse().unwrap());
        } else {
            let cfg = config::load(&app);
            if cfg.mode == "remote" {
                let _ = w.navigate(cfg.main_url().parse().unwrap());
            } else {
                // 本地模式: 用 App URL(asset protocol), navigate 不支持,
                // 改用 eval 触发整页重载
                let _ = w.eval("location.reload()");
            }
        }
    }
}

#[tauri::command]
pub fn toggle_fullscreen(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        // macOS 原生 zoom 行为(绿色按钮), 而非新建桌面全屏
        if w.is_maximized().unwrap_or(false) {
            let _ = w.unmaximize();
        } else {
            let _ = w.maximize();
        }
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
        .inner_size(460.0, 380.0)
        .resizable(false)
        .center()
        .build();
}
