/** macOS 桌面壳检测 — 支持两种注入方式:
 *  1. Tauri initialization_script → window.__COCKPIT_DESKTOP (生产)
 *  2. Query param ?desktop=1 (开发) */

declare global {
  interface Window {
    __COCKPIT_DESKTOP?: number;
    __COCKPIT_API_BASE?: string;
  }
}

function detectDesktop(): boolean {
  if (window.__COCKPIT_DESKTOP) return true;
  return new URLSearchParams(window.location.search).get("desktop") === "1";
}

export const isDesktop = detectDesktop();

export function initDesktopMode() {
  if (!isDesktop) return;
  document.documentElement.classList.add("desktop");
}
