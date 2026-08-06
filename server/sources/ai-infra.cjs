// AI 基础设施资本出清与复合 ROI — 聚合 + 预测模型
// 历史: SEC CapEx(实测) + OpenRouter 定价(实测) + 锚点表
// 预测: 参数化外推(2026-2035), 虚线段 actual=false
"use strict";

module.exports = function createAiInfra(ctx) {
  const { fetchText, fetchWithFallback, readHistory, writeHistory, bjToday } = ctx;

  // 模型参数(集中在顶部, 调参只改这里)
  const MODEL = {
    // 电网就绪度: LBNL 年度锚点(0-100 合成指数, 已批准并网容量/数据中心需求)
    gridAnchors: { 2022: 82, 2023: 74, 2024: 68, 2025: 61 },
    gridCapCagr: 0.06,      // 电网容量年增(建设稳步, 电网本身不退化)
    gridDemandK: 1.0,       // 需求增速 = 容量增速 × (1 + K×capexGrowth/0.2) (AI景气度驱动)
    // 云巨头 CapEx 预测增速([0]=2026当年估算见顶, [1..9]=2027-2035: 资本硬着陆增速趋缓, 2030+平稳)
    capexGrowth: [0.20, 0.05, 0.03, 0.02, 0.01, 0.00, -0.02, -0.02, -0.01, 0.00],
    // Token 单位经济学
    costDecline: -0.42,     // 生产成本年降(2023-2026 崩塌 ~95%, 硬件算力密度+算法蒸馏)
    priceDecline: -0.35,    // 售价年降(2022-2026, 慢于成本 → 毛利扩张)
    priceStableFrom: 2027,  // 2027+ 价格策略性稳定(按价值计费, B端溢价), 降价趋缓
    priceStableDecline: -0.12,
    // 云 AI 收入预测增速([0]=2026当年估算, [1..9]=2027-2035): 对齐市场共识 30%→衰减
    revenueGrowth: [0.30, 0.30, 0.28, 0.25, 0.20, 0.16, 0.13, 0.11, 0.09, 0.08],
    // AI 收入占比(云收入 × 此比例 = AI 增量收入): 2022 15% → 2025 55% → 2035 85%(B端全面铺开, 按价值计费)
    aiShare: [0.15, 0.25, 0.45, 0.55, 0.62, 0.68, 0.72, 0.76, 0.79, 0.81, 0.83, 0.84, 0.85, 0.85],
    // AI 相关 capex 占比(数据中心/AI基建占总资本开支): 2022 40% → 2035 98%
    aiCapexShare: [0.40, 0.50, 0.60, 0.70, 0.80, 0.85, 0.88, 0.90, 0.92, 0.94, 0.95, 0.96, 0.97, 0.98],
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
          ? +(price[y - 1] * (1 + (y >= MODEL.priceStableFrom ? MODEL.priceStableDecline : MODEL.priceDecline))).toFixed(2)
          : (priceHist[y] ?? null);
      cost[y] = y === FORECAST_START - 1
        ? +(cost[y - 1] * (1 + MODEL.costDecline)).toFixed(3)
        : isForecast
          ? +(cost[y - 1] * (1 + MODEL.costDecline)).toFixed(3)
          : (costHist[y] ?? null);
      // AI 收入 = 云业务 AI 增量 + 独立模型公司收入(纯AI口径, 排除云存量)
      const cloudRev = y === FORECAST_START - 1
        ? (cloudRevHist[y - 1] || 0) * (1 + MODEL.revenueGrowth[0])
        : isForecast
          ? (cloudRevenue[y - 1] * (1 + MODEL.revenueGrowth[idx]))
          : (cloudRevHist[y] ?? 0);
      cloudRevenue[y] = cloudRev;
      const shareIdx = y - START_YEAR;
      const modelCo = (inputs.modelCoHist || {})[y] ?? 0;
      const aiRev = cloudRev * MODEL.aiShare[shareIdx] + modelCo;
      revenue[y] = Math.round(aiRev);
      actual[y] = !isForecast;
      // 电网就绪度: 2022-2026H1 横盘走低(排队积压), 2026H2 政策拐点
      // FERC 60天并网强制令 + 巨头自建核电/微电网激活 → 陡峭上扬
      if (y >= FORECAST_START) {
        // 政策效应: 供给端加速(自建核电+强制并网), 就绪度每年 +6~8, 2035 稳定在 85
        grid[y] = Math.max(5, Math.min(100, +(grid[y - 1] + 6.5).toFixed(1)));
      } else if (y === FORECAST_START - 1) {
        grid[y] = Math.max(5, Math.min(100, +((gridAnchors[y] ?? grid[y - 1]) * 0.97).toFixed(1))); // 2026 年中仍在底部
      } else {
        grid[y] = gridAnchors[y] ?? 50;
      }
    }

    // 年度 AI 专项 ROI: (AI收入 - AI capex) / AI capex — AI capex = 总capex × AI占比
    // 投入期深负 → 2026 拐点 → 2027-2028 转正(市场观点), 排除云存量干扰
    const roi = {};
    for (const y of years) {
      const aiCap = capex[y] * MODEL.aiCapexShare[y - START_YEAR];
      roi[y] = aiCap > 0 ? +(((revenue[y] - aiCap) / aiCap) * 100).toFixed(1) : 0;
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

    // 历史输入: SEC 实测 + 落盘历史兜底 + 锚点 fallback
    // (SEC 上游失败时用上次成功落盘的数据, 避免 ROI 全 0)
    const lastHist = readHistory("sec-capex-history.json") || {};
    const lastSnap = Object.values(lastHist).pop() || {};
    const secCapex = secOk?.capexTotal || lastSnap.capexTotal || {};
    const secDep = secOk?.depTotal || lastSnap.depTotal || {};
    // 最终锚点 fallback(2022-2025 四家实测值, SEC 与历史都不可用时保底)
    const CAPEX_ANCHORS = { 2022: 146, 2023: 141, 2024: 225, 2025: 317 };
    const DEP_ANCHORS = { 2022: 60, 2023: 70, 2024: 90, 2025: 110 };
    const capexHist = Object.keys(secCapex).length ? secCapex : CAPEX_ANCHORS;
    const depHist = Object.keys(secDep).length ? secDep : DEP_ANCHORS;
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
        "roiPct: 年度AI专项ROI = (AI收入-AI capex)/AI capex; AI收入=云AI增量+模型公司(估算), AI capex=总capex×AI占比",
      ],
    };
  }

  // SEC 封装(避免与 createSecCapex 重复依赖, 直接内联轻量拉取)
  async function fetchSecCapex() {
    const { handleSecCapex } = require("./sec-capex.cjs")({ fetchWithFallback, readHistory, writeHistory, bjToday });
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
    return { 2022: 0, 2023: 2, 2024: 6, 2025: 18, 2026: 70, 2027: 110, 2028: 160, 2029: 215, 2030: 275, 2031: 330, 2032: 380, 2033: 425, 2034: 465, 2035: 500 };
  }

  return { computeSeries, handleAiInfra, MODEL };
};
