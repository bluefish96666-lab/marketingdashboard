/** 自选股列表: 开源版 localStorage; 与驾驶舱 WatchlistPanel 共用同一把钥匙 */

import { isWatchableTicker } from "./code";
import { loadJson, saveJson } from "./storage";

export const WATCHLIST_LS_KEY = "dash:watchlist";
/** 默认自选: 沪硅产业 / 沪电股份 / 云天化 / 立讯精密 */
export const DEFAULT_WATCHLIST = ["sh688126", "sz002463", "sh600096", "sz002475"];

/** 只保留可订阅代码; 非法项丢弃, 绝不补造价格或占位行情 */
export function sanitizeWatchlist(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || !raw.every((x) => typeof x === "string")) return null;
  const codes = raw.map((x) => x.trim()).filter(isWatchableTicker);
  const uniq: string[] = [];
  for (const c of codes) if (!uniq.includes(c)) uniq.push(c);
  return uniq;
}

export function loadWatchlist(): string[] {
  const parsed = sanitizeWatchlist(loadJson<unknown>(WATCHLIST_LS_KEY, null));
  return parsed ?? [...DEFAULT_WATCHLIST];
}

export function saveWatchlist(codes: string[]): void {
  saveJson(WATCHLIST_LS_KEY, codes);
}
