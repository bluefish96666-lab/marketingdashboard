import { normalizeStockCode } from "@/lib/code";
import type { FinCompany } from "./FinContext";

const A_SHARE = /^(sh|sz|bj|nq)\d{6}$/;

/** Enter / 「查」共用: 有下拉则取高亮或首条; 否则把输入当 A 股代码。名称检索仍走下拉 */
export function resolveFinLookup(
  input: string,
  suggestions: { code: string; name: string }[],
  highlightIdx: number,
): FinCompany | null {
  if (highlightIdx >= 0 && highlightIdx < suggestions.length) {
    const s = suggestions[highlightIdx];
    return { code: normalizeStockCode(s.code), name: s.name };
  }
  if (suggestions.length > 0) {
    const s = suggestions[0];
    return { code: normalizeStockCode(s.code), name: s.name };
  }
  const t = input.trim();
  if (!t) return null;
  const code = normalizeStockCode(t);
  if (A_SHARE.test(code)) return { code, name: t };
  return null;
}

/**
 * 点 chip × 移除。若删的是当前公司, 切到「下一条」剩余 chip
 * (原位置之后的那只; 若已是末条则取新的末条)。列表空了则公司保持不变。
 */
export function applyRemoveRecent(
  recent: FinCompany[],
  current: FinCompany,
  removeCode: string,
): { recent: FinCompany[]; company: FinCompany } {
  const idx = recent.findIndex((r) => r.code === removeCode);
  if (idx < 0) return { recent, company: current };
  const nextRecent = recent.filter((r) => r.code !== removeCode);
  if (current.code !== removeCode || nextRecent.length === 0) {
    return { recent: nextRecent, company: current };
  }
  return { recent: nextRecent, company: nextRecent[Math.min(idx, nextRecent.length - 1)] };
}
