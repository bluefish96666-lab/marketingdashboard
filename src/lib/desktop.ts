/** macOS 桌面壳检测 — 与 TV 模式同模式: query param ?desktop=1 */

function detectDesktop(): boolean {
  return new URLSearchParams(window.location.search).get("desktop") === "1";
}

export const isDesktop = detectDesktop();

export function initDesktopMode() {
  if (!isDesktop) return;
  document.documentElement.classList.add("desktop");
}
