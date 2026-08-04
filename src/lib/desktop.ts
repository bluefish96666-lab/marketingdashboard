/** macOS 桌面壳检测: 通过 ?desktop=1 查询参数 */
export function isDesktop(): boolean {
  return new URLSearchParams(window.location.search).get("desktop") === "1";
}

export function initDesktopMode() {
  if (!isDesktop()) return;
  document.documentElement.classList.add("desktop");
}
