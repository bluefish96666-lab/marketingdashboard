import { isTv } from "./tv";

/**
 * 遥控器方向键空间导航(仅 TV 模式启用):
 * - 约定 [data-tv-focusable] 为可聚焦元素, 方向键按几何距离移动到最近元素;
 * - ↑/↓ 优先滚动焦点所在面板内部的可滚动容器, 滚不动再移动焦点;
 * - OK(Enter) 触发焦点元素 click(面板 = 放大/还原, 链接/按钮 = 原生行为);
 * - DOM 变化后焦点丢失时自动聚焦第一个可聚焦元素。
 */

const SEL = "[data-tv-focusable]";
const SCROLL_STEP = 160;

type Dir = "up" | "down" | "left" | "right";

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

function focusables(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(SEL)).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

/** 按方向找几何上最近的候选: 主轴距离 + 次轴偏移加权 */
function nearest(from: DOMRect, dir: Dir, candidates: HTMLElement[]): HTMLElement | null {
  const cx = from.left + from.width / 2;
  const cy = from.top + from.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of candidates) {
    const r = el.getBoundingClientRect();
    const dx = r.left + r.width / 2 - cx;
    const dy = r.top + r.height / 2 - cy;
    let primary: number;
    let secondary: number;
    if (dir === "up") {
      if (dy >= -4) continue;
      primary = -dy;
      secondary = Math.abs(dx);
    } else if (dir === "down") {
      if (dy <= 4) continue;
      primary = dy;
      secondary = Math.abs(dx);
    } else if (dir === "left") {
      if (dx >= -4) continue;
      primary = -dx;
      secondary = Math.abs(dy);
    } else {
      if (dx <= 4) continue;
      primary = dx;
      secondary = Math.abs(dy);
    }
    const score = primary + secondary * 2.2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

/** 焦点元素最近的纵向可滚动祖先(面板内部列表) */
function scrollableAncestor(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const s = getComputedStyle(node);
    if (/(auto|scroll)/.test(s.overflowY) && node.scrollHeight > node.clientHeight + 4) return node;
    node = node.parentElement;
  }
  return null;
}

function ensureFocus() {
  const ae = document.activeElement as HTMLElement | null;
  if (ae && ae !== document.body && ae.isConnected) return;
  focusables()[0]?.focus({ preventScroll: true });
}

function onKeyDown(e: KeyboardEvent) {
  const dir = KEY_DIR[e.key];
  const active = (document.activeElement as HTMLElement | null) ?? document.body;

  if (e.key === "Enter") {
    if (active.matches?.(SEL)) {
      e.preventDefault();
      active.click();
    }
    return;
  }
  if (!dir) return;
  e.preventDefault();

  // 幻灯片模式: 有面板处于放大浮层时, ←/→ 直接切换到相邻面板
  if (dir === "left" || dir === "right") {
    const zoomed = document.querySelector<HTMLElement>("section[data-tv-zoomed]");
    if (zoomed) {
      const panels = Array.from(document.querySelectorAll<HTMLElement>("section[data-tv-focusable]"));
      const i = panels.indexOf(zoomed);
      if (i >= 0) {
        const next = panels[(i + (dir === "right" ? 1 : panels.length - 1)) % panels.length];
        next?.click();
        next?.focus({ preventScroll: true });
      }
      return;
    }
  }

  // ↑/↓ 优先滚动焦点所在面板内部的可滚动容器
  if (dir === "up" || dir === "down") {
    const scroller = scrollableAncestor(active.matches?.(SEL) ? active : null);
    if (scroller) {
      const atTop = scroller.scrollTop <= 0;
      const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
      if ((dir === "up" && !atTop) || (dir === "down" && !atBottom)) {
        scroller.scrollBy({ top: dir === "up" ? -SCROLL_STEP : SCROLL_STEP, behavior: "smooth" });
        return;
      }
    }
  }

  const from = active.matches?.(SEL)
    ? active.getBoundingClientRect()
    : new DOMRect(window.innerWidth / 2, window.innerHeight / 2, 0, 0);
  const next = nearest(from, dir, focusables().filter((el) => el !== active));
  next?.focus({ preventScroll: false });
}

export function initTvFocus() {
  if (!isTv) return;
  window.addEventListener("keydown", onKeyDown, true);
  // 路由切换/数据重渲染后焦点元素可能被移除, 焦点回退到第一个可聚焦元素
  let timer = 0;
  new MutationObserver(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(ensureFocus, 300);
  }).observe(document.body, { childList: true, subtree: true });
  window.setTimeout(ensureFocus, 500);
}
