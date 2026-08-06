// AI 基础设施资本出清与复合 ROI — 聚合 + 预测模型
// 历史: SEC CapEx(实测) + OpenRouter 定价(实测) + 锚点表
// 预测: 参数化外推(2026-2035), 虚线段 actual=false
"use strict";

module.exports = function createAiInfra(ctx) {
  const { fetchText, readHistory, writeHistory } = ctx;

  // 模型参数(集中在顶部, 调参只改这里)
  const MODEL = {
    // 电网就绪度: LBNL 年度锚点(0-100 合成指数, 已批准并网容量/数据中心需求)
    gridAnchors: { 2022: 82, 2023: 74, 2024: 68, 2025: 61 },
    gridCapCagr: 0.06,      // 并网容量年增
    gridDemandK: 1.55,      // 数据中心需求放大系数(需求增速 = capCagr × K)
    // 云巨头 CapEx 预测增速(2026-2035: 高增长→见顶→出清负增长)
    capexGrowth: [0.20, 0.18, 0.16, 0.10, 0.05, 0.00, -0.05, -0.08, -0.06, -0.03],
    // Token 单位经济学
    costDecline: -0.42,     // 生产成本年降(摩尔式)
    priceDecline: -0.35,    // 售价年降(慢于成本 → 毛利扩张)
    // 云 AI 收入预测增速(2026 起, 2029 后衰减)
    revenueGrowth: [0.25, 0.25, 0.25, 0.25, 0.20, 0.16, 0.13, 0.11, 0.09, 0.08],
    // AI 收入占比(云收入 × 此比例 = AI 收入): 2022 15% → 2035 70%
    aiShare: [0.15, 0.20, 0.28, 0.35, 0.42, 0.50, 0.56, 0.60, 0.64, 0.66, 0.68, 0.69, 0.70, 0.70],
  };
  const START_YEAR = 2022;
  const FORECAST_START = 2026;
  const END_YEAR = 2035;

  /** 核心纯函数: 历史 + 预测 → 年度序列 */
  function computeSeries(inputs) {
    const { capexHist, depHist, priceHist, costHist, gridAnchors, cloudRevHist } = inputs;
    const years = [];
    for (let y = START_YEAR; y <= END_YEAR; y++) years.push(y);

    // 历史段: 用 SEC/OpenRouter 实测(缺失年用锚点), 预测段外推
    const capex = {}, dep = {}, price = {}, cost = {}, grid = {}, revenue = {}, actual = {};
    const cloudRevenue = {};
    for (const y of years) {
      const idx = y - FORECAST_START; // 预测年 0-based (capexGrowth/revenueGrowth 各 10 个)
      const shareIdx = y - START_YEAR; // aiShare 14 个, 全覆盖
      const isForecast = y >= FORECAST_START;
      capex[y] = isForecast
        ? Math.round(capex[y - 1] * (1 + MODEL.capexGrowth[idx]))
        : (capexHist[y] ?? 0);
      dep[y] = isForecast
        ? Math.round(dep[y - 1] * 1.15)
        : (depHist[y] ?? 0);
      price[y] = isForecast
        ? +(price[y - 1] * (1 + MODEL.priceDecline)).toFixed(2)
        : (priceHist[y] ?? null);
      cost[y] = isForecast
        ? +(cost[y - 1] * (1 + MODEL.costDecline)).toFixed(3)
        : (costHist[y] ?? null);
      // AI 收入 = 云收入 × AI 渗透率
      const cloudRev = isForecast ? (cloudRevenue[y - 1] * (1 + MODEL.revenueGrowth[idx])) : (cloudRevHist[y] ?? 0);
      cloudRevenue[y] = cloudRev;
      revenue[y] = Math.round(cloudRev * MODEL.aiShare[shareIdx]);
      actual[y] = !isForecast;
      // 电网就绪度: 需求增速 = 容量增速 × K; 就绪度 = 100 × (容量/需求)
      if (isForecast) {
        const capRatio = 1 + MODEL.gridCapCagr;
        const demRatio = 1 + MODEL.gridCapCagr * MODEL.gridDemandK;
        grid[y] = Math.max(5, Math.min(100, +((grid[y - 1] / 100) * (capRatio / demRatio) * 100).toFixed(1)));
      } else {
        grid[y] = gridAnchors[y] ?? 50;
      }
    }

    // 复合 ROI: 累计(收入-资本开支)/累计资本开支 — 折旧不重复扣除(已含于capex分母)
    let cumCap = 0, cumRev = 0;
    const roi = {};
    for (const y of years) {
      cumCap += capex[y]; cumRev += revenue[y];
      roi[y] = cumCap > 0 ? +(((cumRev - cumCap) / cumCap) * 100).toFixed(1) : 0;
    }

    return years.map((y) => ({
      year: y,
      capexB: capex[y],
      depB: dep[y],
      pricePerM: price[y],
      costPerM: cost[y],
      grid: grid[y],
      revenueB: revenue[y],
      roiPct: roi[y],
      actual: actual[y],
    }));
  }

  /** 端点处理: 聚合三源数据 + 预测 */
  async function handleAiInfra() {
    const [sec, token, ppi] = await Promise.allSettled([
      fetchSecCapex(),
      fetchTokenPrices(),
      fetchFredPpi(),
    ]);
    const secOk = sec.status === "fulfilled" ? sec.value : null;
    const tokenOk = token.status === "fulfilled" ? token.value : null;
    const ppiOk = ppi.status === "fulfilled" ? ppi.value : null;

    // 历史输入: SEC 实测 + 锚点 fallback
    const capexHist = secOk?.capexTotal || {};
    const depHist = secOk?.depTotal || {};
    const cloudRevHist = computeRevenueHist(secOk); // 四家云业务收入锚点(近似)
    const priceHist = tokenOk?.priceSeries || {};
    const costHist = tokenOk?.costSeries || {};

    const series = computeSeries({ capexHist, depHist, priceHist, costHist, gridAnchors: MODEL.gridAnchors, cloudRevHist: computeRevenueHist(secOk) });
    return {
      generatedAt: new Date().toISOString(),
      model: MODEL,
      series,
      sources: {
        sec: secOk ? { ok: true, byCompany: secOk.byCompany } : { ok: false, err: sec.reason?.message },
        token: tokenOk ? { ok: true, marketInputPerM: tokenOk.live?.marketInputPerM, vendorCount: tokenOk.live?.vendorCount } : { ok: false, err: token.reason?.message },
        ppi: ppiOk ? { ok: true, trend: ppiOk.trend, yoy12m: ppiOk.yoy12m } : { ok: false, err: ppi.reason?.message },
      },
      notes: [
        "capex: SEC 10-K 实测(PaymentsToAcquire*), 预测为模型外推",
        "grid: LBNL 年度锚点 + 模型外推(合成指数, 非官方)",
        "costPerM: 厂商不披露, 公开研究估算",
        "pricePerM: 2022-2024 定价史锚点, 2025+ OpenRouter 实时加权均价",
        "roiPct: 累计(云AI收入-资本开支-折旧)/累计资本开支, 云收入为近似口径",
      ],
    };
  }

  // SEC 封装(避免与 createSecCapex 重复依赖, 直接内联轻量拉取)
  async function fetchSecCapex() {
    const { handleSecCapex } = require("./sec-capex.cjs")({ fetchText, readHistory, writeHistory });
    return handleSecCapex();
  }
  async function fetchTokenPrices() {
    const { buildPriceSeries } = require("./token-prices.cjs")({ fetchText });
    return buildPriceSeries();
  }
  async function fetchFredPpi() {
    const { handleFredPpi } = require("./fred-ppi.cjs")({ fetchText });
    return handleFredPpi();
  }

  // 云收入近似(四家云业务收入, 十亿美元): AWS+Azure+GCP
  function computeRevenueHist(secOk) {
    const base = {
      2022: 166, 2023: 193, 2024: 225, 2025: 305,
    };
    return base;
  }

  return { computeSeries, handleAiInfra, MODEL };
};
