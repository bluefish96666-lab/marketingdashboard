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
  modelCoHist: { 2022: 0, 2023: 2, 2024: 6, 2025: 18, 2026: 80, 2027: 140, 2028: 200, 2029: 260, 2030: 320, 2031: 370, 2032: 410, 2033: 440, 2034: 460, 2035: 470 },
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

test("预测段 actual=false 且 capex 先增后减(资本出清形态)", () => {
  const s = computeSeries(inputs);
  const f = s.filter((p) => p.year >= 2027);
  assert.equal(f.length, 9); // 2027-2035
  assert.ok(f.every((p) => p.actual === false));
  // 前期增长(2027-2030)
  for (let i = 1; i < 4; i++) assert.ok(f[i].capexB > f[i - 1].capexB, `capex ${f[i].year} 应增长`);
  // 出清期负增长(2032-2035)
  assert.ok(f[5].capexB < f[4].capexB, "2032 起 capex 应收缩(出清)");
  assert.ok(f[8].capexB < f[7].capexB, "2035 capex 应低于 2034");
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

test("复合 ROI: 2025 前为负(投入期), 2026 拐点, 2027 转正(市场观点)", () => {
  const s = computeSeries(inputs);
  const roi2025 = s.find((p) => p.year === 2025).roiPct;
  const roi2026 = s.find((p) => p.year === 2026).roiPct;
  const roi2027 = s.find((p) => p.year === 2027).roiPct;
  assert.ok(roi2025 < 0, `2025 ROI 应为负(投入期): ${roi2025}`);
  assert.ok(roi2026 > roi2025, "2026 ROI 应高于 2025(拐点)");
  assert.ok(roi2027 > 0, `2027 ROI 应转正(市场观点): ${roi2027}`);
  // 单调性: 2025(投入低谷)后 ROI 应随年份上升
  const rois = s.map((p) => p.roiPct);
  const from2025 = rois.indexOf(rois.find((r, i) => s[i].year === 2025));
  for (let i = from2025 + 1; i < rois.length; i++) assert.ok(rois[i] >= rois[i - 1], `ROI ${s[i].year} 应≥前一年`);
});

test("电网就绪度: U型 — AI热潮期回落(瓶颈), 出清后回升(修复)", () => {
  const s = computeSeries(inputs);
  const g = s.map((p) => p.grid);
  assert.ok(g.every((v) => v >= 5 && v <= 100), "就绪度应在 [5,100]");
  // 历史锚点 2022=82 -> 2025=61
  assert.equal(g[0], 82);
  // 2026(当年估算)应继续回落(需求增速>容量增速)
  assert.ok(g[4] < 61, `2026 就绪度应低于 2025: ${g[4]}`);
  // 出清后回升: 谷底后单调上升, 2035 > 谷底
  const valley = Math.min(...g.slice(4));
  const valleyIdx = g.indexOf(valley);
  const tail = g.slice(valleyIdx + 1);
  assert.ok(tail.length >= 3, "谷底后应有足够回升空间");
  assert.ok(tail.every((v, i) => i === 0 || v >= tail[i - 1]), "谷底后就绪度应回升");
  assert.ok(g[g.length - 1] > valley, `2035 应高于谷底: ${g[g.length - 1]} vs ${valley}`);
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
