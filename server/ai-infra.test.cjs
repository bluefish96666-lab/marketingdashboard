// ai-infra 预测模型单测 — node:test(server CJS 不经过 vitest)
// 运行: node --test server/ai-infra.test.cjs
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { computeSeries, MODEL } = require("./sources/ai-infra.cjs")({});

// 模拟输入(与真实锚点一致)
const inputs = {
  capexHist: { 2022: 146, 2023: 141, 2024: 225, 2025: 317 },
  depHist: { 2022: 60, 2023: 70, 2024: 90, 2025: 110 },
  priceHist: { 2022: 60, 2023: 30, 2024: 5, 2025: 1.5 },
  costHist: { 2022: 25, 2023: 3, 2024: 1, 2025: 0.3 },
  gridAnchors: MODEL.gridAnchors,
  cloudRevHist: { 2022: 146, 2023: 172, 2024: 205, 2025: 260 },
  modelCoHist: { 2022: 0, 2023: 2, 2024: 6, 2025: 18, 2026: 70, 2027: 110, 2028: 160, 2029: 215, 2030: 275, 2031: 330, 2032: 380, 2033: 425, 2034: 465, 2035: 500 },
};

test("历史段 actual=true 且透传锚点值(2022-2026, 2026为当年估算)", () => {
  const s = computeSeries(inputs);
  const h = s.filter((p) => p.year < 2027);
  assert.equal(h.length, 5); // 2022-2026
  assert.ok(h.every((p) => p.actual === true));
  assert.equal(h[0].capexB, 146); // 2022
  assert.equal(h[3].capexB, 317); // 2025
  assert.equal(h[3].pricePerM, 1.5);
  assert.ok(h[4].capexB > h[3].capexB, "2026 当年估算应高于 2025");
});

test("预测段 actual=false 且 capex 增速放缓(2026见顶后硬着陆)", () => {
  const s = computeSeries(inputs);
  const f = s.filter((p) => p.year >= 2027);
  assert.equal(f.length, 9); // 2027-2035
  assert.ok(f.every((p) => p.actual === false));
  // 2026 见顶, 2027 后增速大幅放缓(资本硬着陆)
  const c2025 = s.find((p) => p.year === 2025).capexB;
  const c2026 = s.find((p) => p.year === 2026).capexB;
  const c2030 = s.find((p) => p.year === 2030).capexB;
  const c2035 = s.find((p) => p.year === 2035).capexB;
  assert.ok(c2026 > c2025, "2026 capex 应高于 2025(见顶)");
  assert.ok(Math.abs(c2030 - c2026) / c2026 < 0.15, "2030 capex 应接近 2026(硬着陆增速趋缓)");
  assert.ok(c2035 <= c2030 * 1.05, "2035 capex 不应显著高于 2030");
});

test("预测段 price/cost 单调下降且 price 下降慢于 cost(毛利扩张)", () => {
  const s = computeSeries(inputs);
  const f = s.filter((p) => p.year >= 2027);
  for (let i = 1; i < f.length; i++) {
    assert.ok(f[i].pricePerM < f[i - 1].pricePerM, "price 应下降");
    assert.ok(f[i].costPerM < f[i - 1].costPerM, "cost 应下降");
  }
  // 剪刀差: price/cost 比值随时间扩大(毛利扩张)
  const r1 = f[0].pricePerM / f[0].costPerM;
  const rLast = f[f.length - 1].pricePerM / f[f.length - 1].costPerM;
  assert.ok(rLast > r1, `毛利剪刀差应扩大: ${r1.toFixed(1)} -> ${rLast.toFixed(1)}`);
});

test("年度AI专项ROI: 2022-2025 深负(投入期), 2026 拐点, 2027 转正", () => {
  const s = computeSeries(inputs);
  const roi2022 = s.find((p) => p.year === 2022).roiPct;
  const roi2025 = s.find((p) => p.year === 2025).roiPct;
  const roi2026 = s.find((p) => p.year === 2026).roiPct;
  const roi2027 = s.find((p) => p.year === 2027).roiPct;
  assert.ok(roi2022 < -30, `2022 ROI 应深负: ${roi2022}`);
  assert.ok(roi2025 < -20, `2025 ROI 应深负: ${roi2025}`);
  assert.ok(roi2026 > roi2025, "2026 ROI 应高于 2025(拐点)");
  assert.ok(roi2027 > 0, `2027 ROI 应转正: ${roi2027}`);
  // 2027 后单调上升
  const from27 = s.findIndex((p) => p.year === 2027);
  for (let i = from27 + 1; i < s.length; i++) assert.ok(s[i].roiPct >= s[i - 1].roiPct, `ROI ${s[i].year} 应≥前一年`);
});

test("电网就绪度: 2022-2026 底部横盘(排队积压), 2027 起政策拐点陡峭上扬(FERC+核电)", () => {
  const s = computeSeries(inputs);
  const g = s.map((p) => p.grid);
  assert.ok(g.every((v) => v >= 5 && v <= 100), "就绪度应在 [5,100]");
  // 历史锚点 2022=82 -> 2025=61(排队积压走低)
  assert.equal(g[0], 82);
  // 2026 仍在底部(< 65)
  assert.ok(g[4] < 65, `2026 就绪度应处底部: ${g[4]}`);
  // 2027 起政策拐点: 上扬至封顶后持平(不回落)
  for (let i = 5; i < g.length; i++) assert.ok(g[i] >= g[i - 1], `${s[i].year} 就绪度应≥前一年`);
  // 2035 回到高位(>75)
  assert.ok(g[g.length - 1] > 75, `2035 就绪度应回到高位: ${g[g.length - 1]}`);
});

test("序列完整: 2022-2035 共 14 年, 字段齐全", () => {
  const s = computeSeries(inputs);
  assert.equal(s.length, 14);
  assert.equal(s[0].year, 2022);
  assert.equal(s[13].year, 2035);
  for (const p of s) {
    for (const k of ["year", "capexB", "depB", "pricePerM", "costPerM", "grid", "revenueB", "roiPct", "actual"]) {
      assert.ok(k in p, `缺字段 ${k} @ ${p.year}`);
    }
  }
});
