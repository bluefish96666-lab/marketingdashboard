use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub const DEFAULT_URL: &str = "https://mrd.hermes.cc.cd";

#[derive(Serialize, Deserialize, Clone)]
#[serde(default)]
pub struct Config {
    pub mode: String,       // "local" | "remote"
    pub server_url: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            mode: "local".into(),
            server_url: DEFAULT_URL.into(),
        }
    }
}

impl Config {
    /// 主窗口 URL:
    /// - 远程模式: https://server/?desktop=1
    /// - 本地模式: tauri://localhost/index.html (asset protocol, 配置通过 init script 注入)
    pub fn main_url(&self) -> String {
        if self.mode == "remote" {
            let server = self.server_url.trim_end_matches('/');
            format!("{server}/?desktop=1")
        } else {
            "tauri://localhost/index.html".into()
        }
    }

    pub fn dev_url() -> String {
        "http://localhost:3000/?desktop=1".into()
    }
}

fn config_path(app: &AppHandle) -> PathBuf {
    app.path().app_config_dir().unwrap_or_default().join("config.json")
}

pub fn load(app: &AppHandle) -> Config {
    let path = config_path(app);
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save(app: &AppHandle, cfg: &Config) -> Result<(), String> {
    let path = config_path(app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}
