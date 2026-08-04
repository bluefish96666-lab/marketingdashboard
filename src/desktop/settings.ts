import { invoke } from "@tauri-apps/api/core";

const urlInput = document.getElementById("url") as HTMLInputElement;
const saveBtn = document.getElementById("save") as HTMLButtonElement;
const msg = document.getElementById("msg") as HTMLDivElement;

async function init() {
  try {
    const cfg = await invoke<{ server_url: string }>("load_config");
    urlInput.value = cfg.server_url;
  } catch {
    msg.className = "error";
    msg.textContent = "请在桌面应用中打开此页面";
  }
}

saveBtn.addEventListener("click", async () => {
  const url = urlInput.value.trim();
  if (!url || !/^https?:\/\/.+/.test(url)) {
    msg.className = "error";
    msg.textContent = "请输入有效的服务器地址 (http:// 或 https://)";
    return;
  }
  try {
    await invoke("save_config", { serverUrl: url });
    await invoke("reload_app");
  } catch (e) {
    msg.className = "error";
    msg.textContent = `保存失败: ${e}`;
  }
});

init();
