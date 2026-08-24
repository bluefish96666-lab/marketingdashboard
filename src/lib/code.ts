/** 股票代码规范化工具 — 裸6位代码 → 市场前缀代码 */

/** 腾讯报价中心可订阅的个股代码(A / 港 / 美) */
const A_SHARE = /^(sh|sz|bj|nq)\d{6}$/;
const HK_TICKER = /^hk\d{5}$/;
const US_TICKER = /^us[A-Z][A-Z0-9.]{0,9}$/;

/**
 * 裸6位数字代码补全市场前缀:
 *   6xxxxx → sh, 0/2/3xxxxx → sz, 8xxxxx → nq(新三板), 4/9xxxxx → bj
 * 已带 sh/sz/bj/nq 前缀的代码原样返回。
 * 港股/美股请用 normalizeWatchTicker(不改本函数, 以免财报等 A 股调用方误收外盘)。
 */
export function normalizeStockCode(code: string): string {
  const s = code.trim().toLowerCase();
  if (A_SHARE.test(s)) return s;
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

export type WatchMarket = "A" | "HK" | "US";

/** 自选页可添加的代码: 沪深北/新三板 / 港股 hk00000 / 美股 usAAPL */
export function isWatchableTicker(code: string): boolean {
  return A_SHARE.test(code) || HK_TICKER.test(code) || US_TICKER.test(code);
}

export function watchMarketOf(code: string): WatchMarket | "" {
  if (A_SHARE.test(code)) return "A";
  if (HK_TICKER.test(code)) return "HK";
  if (US_TICKER.test(code)) return "US";
  return "";
}

export function watchMarketLabel(code: string): "A" | "港" | "美" | "" {
  const m = watchMarketOf(code);
  return m === "HK" ? "港" : m === "US" ? "美" : m;
}

/**
 * 自选页输入 → 腾讯报价代码(复用既有报价中心, 不引入新数据商):
 *   A: 同 normalizeStockCode
 *   港: hk00700 / 00700.hk / 700 → hk00700
 *   美: usAAPL / AAPL / AAPL.US / gb_aapl → usAAPL
 */
export function normalizeWatchTicker(code: string): string {
  const raw = code.trim();
  if (!raw) return "";

  // A 股先于外盘: 避免 sh600519 被字母规则收成 usSH600519
  const a = normalizeStockCode(raw);
  if (A_SHARE.test(a)) return a;

  const lower = raw.toLowerCase();

  // 新浪美股建议码 gb_aapl → 腾讯 usAAPL
  if (/^gb_[a-z0-9.]{1,10}$/i.test(raw)) {
    return `us${raw.slice(3).toUpperCase()}`;
  }

  // 港股: 前缀 / .hk 后缀 / 1–5 位数字(不足 5 位左侧补 0)
  if (/^hk\d{1,5}$/i.test(lower) || /\.hk$/i.test(lower) || /^\d{1,5}$/.test(lower)) {
    const digits = lower.replace(/\D/g, "");
    if (digits.length >= 1 && digits.length <= 5) return `hk${digits.padStart(5, "0")}`;
  }

  // 美股: us 前缀 / .us 后缀 / 纯字母(含 BRK.B)
  if (/^us[a-z][a-z0-9.]{0,9}$/i.test(raw)) {
    return `us${raw.slice(2).toUpperCase()}`;
  }
  if (/\.us$/i.test(raw)) {
    const ticker = raw.replace(/\.us$/i, "").toUpperCase();
    if (/^[A-Z][A-Z0-9.]{0,9}$/.test(ticker)) return `us${ticker}`;
  }
  if (/^[a-z]{1,6}(\.[a-z])?$/i.test(raw)) {
    return `us${raw.toUpperCase()}`;
  }

  return a;
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
