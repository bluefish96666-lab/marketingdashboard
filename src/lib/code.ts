/** 股票代码规范化工具 — 裸6位代码 → 市场前缀代码 */

/**
 * 裸6位数字代码补全市场前缀:
 *   6xxxxx → sh, 0/2/3xxxxx → sz, 8xxxxx → nq(新三板), 4/9xxxxx → bj
 * 已带 sh/sz/bj/nq 前缀的代码原样返回。
 */
export function normalizeStockCode(code: string): string {
  const s = code.trim().toLowerCase();
  if (/^(sh|sz|bj|nq)\d{6}$/.test(s)) return s;
  if (/^\d{6}$/.test(s)) {
    const c = s[0];
    if (c === "6") return `sh${s}`;
    if (c === "0" || c === "2" || c === "3") return `sz${s}`;
    if (c === "8") return `nq${s}`;
    return `bj${s}`;
  }
  // 无法归一化时返回原输入(调用方自行判断有效性)
  return s;
}

/**
 * 将任意格式代码转为腾讯行情格式(仅保留后6位数字, 6→sh, 0/3→sz, 4/8/9→bj):
 *   用于从问财等来源解析的脏代码清洗。
 *   返回空字符串表示无法解析。
 */
export function toMarketCode(raw: string): string {
  const s = String(raw || "").trim().toLowerCase();
  if (/^(hk|us)/.test(s)) return "";
  const digits = s.replace(/\D/g, "").slice(-6).padStart(6, "0");
  if (!digits || digits === "000000") return "";
  if (/^6/.test(digits)) return `sh${digits}`;
  if (/^[03]/.test(digits)) return `sz${digits}`;
  if (/^[489]/.test(digits)) return `bj${digits}`;
  return digits;
}
