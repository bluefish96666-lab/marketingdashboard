// Token 市场售价 — OpenRouter 实时定价(免费 GET) + 历史锚点表(定价史)
"use strict";

module.exports = function createTokenPrices(ctx) {
  const { fetchText } = ctx;

  // 历史锚点(美元/百万 token, 输入侧加权): 定价史公开事实
  const PRICE_ANCHORS = {
    2022: 60,   // GPT-3 davinci $0.06/1K
    2023: 30,   // GPT-4 发布 $30/M
    2024: 5,    // GPT-4o/竞品价格战
    2025: 3.4,  // 闭源前沿均价(与 spend-index closed 同口径, 2025 实时校验)
  };
  // 生产成本估算锚点(美元/百万 token): 厂商不披露, 公开研究估算
  const COST_ANCHORS = {
    2022: 25,   // GPT-3 级推理
    2023: 3,    // GPT-3.5 级
    2024: 1,    // GPT-4o/Claude 级
    2025: 0.3,  // DeepSeek 级
  };

  /** 拉取 OpenRouter 全模型定价, 聚合为厂商加权均价(美元/百万 token) */
  async function fetchOpenRouterPrices() {
    const j = JSON.parse(await fetchText("https://openrouter.ai/api/v1/models"));
    const byVendor = {};
    for (const m of j.data || []) {
      const vendor = (m.id || "").split("/")[0] || "other";
      const p = m.pricing || {};
      const inPrice = parseFloat(p.prompt) * 1e6;   // /token -> /M
      const outPrice = parseFloat(p.completion) * 1e6;
      if (!Number.isFinite(inPrice) || !Number.isFinite(outPrice)) continue;
      (byVendor[vendor] = byVendor[vendor] || { n: 0, inSum: 0, outSum: 0 });
      byVendor[vendor].n++;
      byVendor[vendor].inSum += inPrice;
      byVendor[vendor].outSum += outPrice;
    }
    const vendors = Object.entries(byVendor).map(([name, v]) => ({
      name,
      models: v.n,
      inputPerM: +(v.inSum / v.n).toFixed(3),
      outputPerM: +(v.outSum / v.n).toFixed(3),
    })).sort((a, b) => b.models - a.models);
    // 全市场加权均价: 过滤异常值(0 价/免费模型/> $10000 每 M 的离群)
    const all = j.data || [];
    const inPrices = all
      .map((m) => parseFloat(m.pricing?.prompt) * 1e6)
      .filter((v) => Number.isFinite(v) && v > 0 && v < 10000);
    const marketAvg = inPrices.length ? +(inPrices.reduce((s, v) => s + v, 0) / inPrices.length).toFixed(3) : null;
    // 闭源前沿均价(主流闭源厂商, 与 spend-index closed 同口径 — 剔除免费/开源小模型拉低)
    const FRONTIER = ["openai", "anthropic", "google", "x-ai", "mistralai", "meta-llama"];
    const frontPrices = all
      .map((m) => ({ v: parseFloat(m.pricing?.prompt) * 1e6, id: m.id || "" }))
      .filter((x) => Number.isFinite(x.v) && x.v > 0 && x.v < 10000 && FRONTIER.some((f) => x.id.startsWith(f)))
      .map((x) => x.v);
    const frontierAvg = frontPrices.length ? +(frontPrices.reduce((s, v) => s + v, 0) / frontPrices.length).toFixed(3) : null;
    return { generatedAt: new Date().toISOString(), source: "openrouter.ai/api/v1/models", vendorCount: vendors.length, marketInputPerM: marketAvg, frontierInputPerM: frontierAvg, vendors: vendors.slice(0, 30) };
  }

  /** 完整售价序列: 2022-2024 锚点 + 2025+ 实时(取闭源前沿均价, 与 spend-index closed 同口径; 拉取失败用锚点) */
  async function buildPriceSeries() {
    let live = null;
    try { live = await fetchOpenRouterPrices(); } catch { /* 上游失败用锚点 */ }
    const series = {};
    for (const [y, v] of Object.entries(PRICE_ANCHORS)) {
      if (y === "2025" && live?.frontierInputPerM != null) series[y] = live.frontierInputPerM;
      else series[y] = v;
    }
    return { priceSeries: series, costSeries: { ...COST_ANCHORS }, live };
  }

  return { fetchOpenRouterPrices, buildPriceSeries, PRICE_ANCHORS, COST_ANCHORS };
};
