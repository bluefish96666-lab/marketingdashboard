/** 全站顶栏路由 — 各页用 pageLinks(当前路径) 排除自身, 避免漏挂新页 */

import { BRAND } from "@/config/branding";

export type NavLink = { to: string; label: string };

export const APP_NAV: NavLink[] = [
  { to: "/", label: BRAND.homeNavLabel },
  { to: "/watch", label: "自选股" },
  { to: "/goods", label: "商品价格" },
  { to: "/gold", label: "黄金观察" },
  { to: "/ai", label: "AI 观察" },
  { to: "/fin", label: "财报窗口" },
];

export function pageLinks(current: string, extra: NavLink[] = []): NavLink[] {
  return [...APP_NAV.filter((l) => l.to !== current), ...extra];
}
