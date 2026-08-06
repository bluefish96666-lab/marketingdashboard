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
    gridCapCagr: 0.06,      // 电网容量年增(建设稳步, 电网本身不退化)
    gridDemandK: 1.0,       // 需求增速 = 容量增速 × (1 + K×capexGrowth/0.2) (AI景气度驱动)
    // 云巨头 CapEx 预测增速([0]=2026当年估算(年中), [1..9]=2027-2035: 高增长→见顶→出清负增长)
    capexGrowth: [0.20, 0.18, 0.16, 0.10, 0.05, 0.00, -0.05, -0.08, -0.06, -0.03],
    // Token 单位经济学
    costDecline: -0.42,     // 生产成本年降(摩尔式)
    priceDecline: -0.35,    // 售价年降(慢于成本 → 毛利扩张)
    // 云 AI 收入预测增速([0]=2026当年估算, [1..9]=2027-2035): 对齐市场共识 30%→衰减
    revenueGrowth: [0.30, 0.30, 0.28, 0.25, 0.20, 0.16, 0.13, 0.11, 0.09, 0.08],
    // AI 收入占比(云收入 × 此比例 = AI 收入): 2022 15% → 2035 70%
    aiShare: [0.15, 0.20, 0.28, 0.35, 0.42, 0.50, 0.56, 0.60, 0.64, 0.66, 0.68, 0.69, 0.70, 0.70], // 保留(纯AI口径参考), 当前ROI用云整体收入
  };
  const START_YEAR = 2022;
  const FORECAST_START = 2027; // 2026 为当年估算(实际已过半), 2027 起预测
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
      const idx = y - FORECAST_START + 1; // 2027→1, 2035→9 (数组[0]为2026当年估算)
      const isForecast = y >= FORECAST_START;
      capex[y] = y === FORECAST_START - 1
        ? Math.round((capex[y - 1] || capexHist[y - 1]) * (1 + MODEL.capexGrowth[0])) // 2026 当年估算
        : isForecast
          ? Math.round(capex[y - 1] * (1 + MODEL.capexGrowth[idx]))
          : (capexHist[y] ?? 0);
      dep[y] = y === FORECAST_START - 1
        ? Math.round((dep[y - 1] || depHist[y - 1]) * 1.15)
        : isForecast
          ? Math.round(dep[y - 1] * 1.15)
          : (depHist[y] ?? 0);
      price[y] = y === FORECAST_START - 1
        ? +(price[y - 1] * (1 + MODEL.priceDecline)).toFixed(2)
        : isForecast
          ? +(price[y - 1] * (1 + MODEL.priceDecline)).toFixed(2)
          : (priceHist[y] ?? null);
      cost[y] = y === FORECAST_START - 1
        ? +(cost[y - 1] * (1 + MODEL.costDecline)).toFixed(3)
        : isForecast
          ? +(cost[y - 1] * (1 + MODEL.costDecline)).toFixed(3)
          : (costHist[y] ?? null);
      // AI 收入 = 云业务收入 + 独立模型公司收入(市场ROI口径: AI基建总变现 vs 云巨头 CapEx)
      const cloudRev = y === FORECAST_START - 1
        ? (cloudRevHist[y - 1] || 0) * (1 + MODEL.revenueGrowth[0])
        : isForecast
          ? (cloudRevenue[y - 1] * (1 + MODEL.revenueGrowth[idx]))
          : (cloudRevHist[y] ?? 0);
      cloudRevenue[y] = cloudRev;
      const modelCo = (inputs.modelCoHist || {})[y] ?? 0;
      revenue[y] = Math.round(cloudRev + modelCo);
      actual[y] = !isForecast;
      // 电网就绪度 = 容量增速 ÷ 需求增速(供需比, 0-100)
      // 需求增速 = 容量增速 × (1 + capexGrowth/0.2): AI热潮期需求爆发→回落, 出清期需求降温→回升(U型)
      if (isForecast || y === FORECAST_START - 1) {
        const gIdx = y === FORECAST_START - 1 ? 0 : idx; // 2026 用 capexGrowth[0], 2027+ 用 [1..9]
        const demG = MODEL.gridCapCagr * (1 + MODEL.gridDemandK * MODEL.capexGrowth[gIdx] / 0.2);
        const ratio = (1 + MODEL.gridCapCagr) / (1 + demG);
        grid[y] = Math.max(5, Math.min(100, +((grid[y - 1] / 100) * ratio * 100).toFixed(1)));
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

    const series = computeSeries({ capexHist, depHist, priceHist, costHist, gridAnchors: MODEL.gridAnchors, cloudRevHist: computeRevenueHist(secOk), modelCoHist: computeModelCoHist() });
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
        "roiPct: 累计(云收入+模型公司收入-资本开支)/累计资本开支; 模型公司收入为估算(OpenAI/Anthropic等)",
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

  // 云收入近似(四家云业务收入, 十亿美元): AWS+Azure+GCP — 保守真实锚点
  function computeRevenueHist(secOk) {
    const base = {
      2022: 146, 2023: 172, 2024: 205, 2025: 260,
    };
    return base;
  }

  // 独立模型公司收入(OpenAI/Anthropic/xAI/Mistral 等, 十亿美元) — AI 基建变现另一半
  function computeModelCoHist() {
    return { 2022: 0, 2023: 2, 2024: 6, 2025: 18, 2026: 80, 2027: 140, 2028: 200, 2029: 260, 2030: 320, 2031: 370, 2032: 410, 2033: 440, 2034: 460, 2035: 470 };
  }

  return { computeSeries, handleAiInfra, MODEL };
};
