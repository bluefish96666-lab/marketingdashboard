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
  cloudRevHist: { 2022: 166, 2023: 193, 2024: 225, 2025: 305 },
};

test("历史段 actual=true 且透传锚点值", () => {
  const s = computeSeries(inputs);
  const h = s.filter((p) => p.year < 2026);
  assert.equal(h.length, 4);
  assert.ok(h.every((p) => p.actual === true));
  assert.equal(h[0].capexB, 146); // 2022
  assert.equal(h[3].capexB, 317); // 2025
  assert.equal(h[3].pricePerM, 1.5);
});

test("预测段 actual=false 且 capex 先增后减(资本出清形态)", () => {
  const s = computeSeries(inputs);
  const f = s.filter((p) => p.year >= 2026);
  assert.equal(f.length, 10); // 2026-2035
  assert.ok(f.every((p) => p.actual === false));
  // 前期增长(2026-2028)
  assert.ok(f[0].capexB > f[0].capexB * 0.9, "2026 capex 应较大");
  for (let i = 1; i < 4; i++) assert.ok(f[i].capexB > f[i - 1].capexB, `capex ${f[i].year} 应增长`);
  // 出清期负增长(2032-2035)
  assert.ok(f[6].capexB < f[5].capexB, "2032 起 capex 应收缩(出清)");
  assert.ok(f[9].capexB < f[8].capexB, "2035 capex 应低于 2034");
});

test("预测段 price/cost 单调下降且 price 下降慢于 cost(毛利扩张)", () => {
  const s = computeSeries(inputs);
  const f = s.filter((p) => p.year >= 2026);
  for (let i = 1; i < f.length; i++) {
    assert.ok(f[i].pricePerM < f[i - 1].pricePerM, "price 应下降");
    assert.ok(f[i].costPerM < f[i - 1].costPerM, "cost 应下降");
  }
  // 剪刀差: price/cost 比值随时间扩大(毛利扩张)
  const r1 = f[0].pricePerM / f[0].costPerM;
  const rLast = f[f.length - 1].pricePerM / f[f.length - 1].costPerM;
  assert.ok(rLast > r1, `毛利剪刀差应扩大: ${r1.toFixed(1)} -> ${rLast.toFixed(1)}`);
});

test("复合 ROI: 早期为负(资本出清期), 后期转正", () => {
  const s = computeSeries(inputs);
  const roi2025 = s.find((p) => p.year === 2025).roiPct;
  const roi2035 = s.find((p) => p.year === 2035).roiPct;
  assert.ok(roi2025 < 0, `2025 ROI 应为负: ${roi2025}`);
  assert.ok(roi2035 > 0, `2035 ROI 应转正: ${roi2035}`);
  // 单调性: ROI 应随年份上升(累计收入追赶资本开支)
  const rois = s.map((p) => p.roiPct);
  for (let i = 1; i < rois.length; i++) assert.ok(rois[i] >= rois[i - 1], `ROI ${s[i].year} 应≥前一年`);
});

test("电网就绪度: 需求放大 → 指数趋势性回落(资本瓶颈)后触底", () => {
  const s = computeSeries(inputs);
  const g = s.map((p) => p.grid);
  assert.ok(g.every((v) => v >= 5 && v <= 100), "就绪度应在 [5,100]");
  // 历史锚点 2022=82 -> 2025=61
  assert.equal(g[0], 82);
  // 预测段应继续回落(需求增速>容量增速)
  const f = s.filter((p) => p.year >= 2026);
  assert.ok(f[0].grid < 61, `2026 就绪度应低于 2025: ${f[0].grid}`);
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
