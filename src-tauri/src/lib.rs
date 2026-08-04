mod commands;
mod config;

use config::Config;
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{Emitter, Manager, Theme, TitleBarStyle, WebviewUrl, WebviewWindowBuilder};

fn make_init_script(cfg: &Config) -> String {
    let api_base = cfg.server_url.trim_end_matches('/');
    format!(
        r#"(()=>{{window.__COCKPIT_DESKTOP=1;window.__COCKPIT_API_BASE="{api_base}";if(window.__cockpitWatchdog)return;window.__cockpitWatchdog=!0;let l=!1;addEventListener('load',()=>{{l=!0}},{{once:!0}});setTimeout(()=>{{if(!l)try{{window.__TAURI_INTERNALS__.invoke('show_error')}}catch(_){{}}}},15000)}})();"#
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let h = app.handle().clone();
            let cfg = config::load(&h);

            // 构建 URL + init script
            let (url_str, init_script) = if cfg!(debug_assertions) {
                (Config::dev_url(), make_init_script(&cfg))
            } else {
                (cfg.main_url(), make_init_script(&cfg))
            };

            let _main = WebviewWindowBuilder::new(
                &h, "main",
                WebviewUrl::External(url_str.parse().unwrap()),
            )
                .title("市场研究驾驶舱")
                .inner_size(1400.0, 900.0)
                .min_inner_size(1024.0, 700.0)
                .center()
                .resizable(true)
                .theme(Some(Theme::Dark))
                .title_bar_style(TitleBarStyle::Overlay)
                .initialization_script(init_script)
                .build()?;

            // --- 菜单栏 ---
            let settings_item = MenuItemBuilder::with_id("settings", "服务器设置…")
                .accelerator("CmdOrCtrl+,")
                .build(&h)?;
            let reload_item = MenuItemBuilder::with_id("reload", "重新加载")
                .accelerator("CmdOrCtrl+R")
                .build(&h)?;
            let open_web_item = MenuItemBuilder::with_id("open-web", "打开网页版").build(&h)?;
            let undo = PredefinedMenuItem::undo(&h, None::<&str>)?;
            let redo = PredefinedMenuItem::redo(&h, None::<&str>)?;
            let cut = PredefinedMenuItem::cut(&h, None::<&str>)?;
            let copy = PredefinedMenuItem::copy(&h, None::<&str>)?;
            let paste = PredefinedMenuItem::paste(&h, None::<&str>)?;
            let select_all = PredefinedMenuItem::select_all(&h, None::<&str>)?;
            let minimize = PredefinedMenuItem::minimize(&h, None::<&str>)?;
            let fullscreen = PredefinedMenuItem::fullscreen(&h, None::<&str>)?;

            let file_menu = SubmenuBuilder::new(&h, "文件")
                .item(&settings_item).separator().item(&reload_item).build()?;
            let edit_menu = SubmenuBuilder::new(&h, "编辑")
                .item(&undo).item(&redo).separator()
                .item(&cut).item(&copy).item(&paste).item(&select_all).build()?;
            let view_menu = SubmenuBuilder::new(&h, "显示")
                .item(&reload_item).separator().item(&fullscreen).build()?;
            let window_menu = SubmenuBuilder::new(&h, "窗口")
                .item(&minimize).build()?;
            let help_menu = SubmenuBuilder::new(&h, "帮助")
                .item(&open_web_item).build()?;
            let menu = MenuBuilder::new(&h)
                .item(&file_menu).item(&edit_menu).item(&view_menu)
                .item(&window_menu).item(&help_menu).build()?;
            h.set_menu(menu)?;

            app.on_menu_event(move |app_handle, event| {
                match event.id().as_ref() {
                    "settings" => {
                        if let Some(w) = app_handle.get_webview_window("main") {
                            let _ = w.emit("open-settings", ());
                        }
                    }
                    "reload" => {
                        if let Some(w) = app_handle.get_webview_window("main") {
                            let _ = w.eval("location.reload()");
                        }
                    }
                    "open-web" => {
                        let _ = tauri_plugin_opener::open_url(
                            config::load(app_handle).server_url, None::<&str>,
                        );
                    }
                    _ => {}
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_config,
            commands::save_config,
            commands::reload_app,
            commands::open_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
