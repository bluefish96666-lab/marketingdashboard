/** 自选股列表: 开源版 localStorage; 与驾驶舱 WatchlistPanel 共用同一把钥匙 */

import { isWatchableTicker } from "./code";
import { loadJson, saveJson } from "./storage";

export const WATCHLIST_LS_KEY = "dash:watchlist";

/** 旧默认 4 占位: 沪硅产业 / 沪电股份 / 云天化 / 立讯精密。仅精确等于此列表时才迁移 */
export const LEGACY_DEFAULT_WATCHLIST = ["sh688126", "sz002463", "sh600096", "sz002475"];

/**
 * 默认自选: 2026-08-24 强度榜 12 只
 * 农业银行 / 长江电力 / 紫金矿业 / 德明利 / 长鑫科技 / 博硕科技
 * 永鼎股份 / 深南电路 / 工业富联 / 澜起科技 / 江海股份 / 光迅科技
 */
export const DEFAULT_WATCHLIST = [
  "sh601288",
  "sh600900",
  "sh601899",
  "sz001309",
  "sh688825",
  "sz300951",
  "sh600105",
  "sz002916",
  "sh601138",
  "sh688008",
  "sz002484",
  "sz002281",
];

export function sameWatchlist(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((c, i) => c === b[i]);
}

/**
 * 无存储 → 新默认; 精确等于旧 4 只默认 → 迁到 12; 其它(含用户改过/清空)原样保留。
 */
export function resolveStoredWatchlist(stored: string[] | null): string[] {
  if (stored == null) return [...DEFAULT_WATCHLIST];
  if (sameWatchlist(stored, LEGACY_DEFAULT_WATCHLIST)) return [...DEFAULT_WATCHLIST];
  return stored;
}

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
  const next = resolveStoredWatchlist(parsed);
  if (parsed != null && sameWatchlist(parsed, LEGACY_DEFAULT_WATCHLIST)) {
    saveWatchlist(next);
  }
  return next;
}

export function saveWatchlist(codes: string[]): void {
  saveJson(WATCHLIST_LS_KEY, codes);
}
