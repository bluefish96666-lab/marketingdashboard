/** 财报窗口共享小工具 */

import { TNUM, fmtYi } from "@/lib/format";
import { normalizeStockCode as prefixCode } from "@/lib/code";

export { TNUM, fmtYi, prefixCode };

/** 报告期标签: "2025-09-30"/"2025Q3" → "25Q3"(趋势图刻度/日历期次) */
export const quarterLabel = (s: string) => {
  const m = s.match(/(\d{4})-(\d{2})-/);
  if (m) {
    const q = ({ "03": "Q1", "06": "Q2", "09": "Q3", "12": "Q4" } as Record<string, string>)[m[2]];
    if (q) return `${m[1].slice(2)}${q}`;
  }
  const m2 = s.match(/(\d{4})\s*Q([1-4])/i);
  if (m2) return `${m2[1].slice(2)}Q${m2[2]}`;
  return s;
};


/** 预告类型配色: 预喜=rose / 预悲=emerald / 不确定=slate(A股红涨绿跌) */
const FORECAST_GOOD = new Set(["预增", "略增", "扭亏", "减亏"]);
const FORECAST_BAD = new Set(["预减", "略减", "首亏", "增亏"]);
export const forecastTone = (type: string): "good" | "bad" | "neutral" =>
  FORECAST_GOOD.has(type) ? "good" : FORECAST_BAD.has(type) ? "bad" : "neutral";
