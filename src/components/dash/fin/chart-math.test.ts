// chart-math 纯函数单测: 三模式(业绩/质量/杠杆)计算的基本不变量
import { describe, expect, it } from "vitest";
import type { FinanceMain, FinanceReport } from "@/lib/api";
import { computeChart, type ChartLayout } from "./chart-math";

const W = 800, H = 400;

function mkReport(date: string, over: Partial<FinanceReport> = {}): FinanceReport {
  return {
    label: date, date,
    revenue: 100, netProfit: 10, revenueYoY: 5, profitYoY: 3,
    roe: 10, grossMargin: 30, netMargin: 10, debtRatio: 50, roic: 8, eps: 1, ocfPerShare: 0.5,
    ...over,
  };
}

// 接口为报告期倒序
const REPORTS: FinanceReport[] = [
  mkReport("2025-12-31", { netProfit: 15, revenueYoY: 10, profitYoY: 8 }),
  mkReport("2025-09-30", { netProfit: 12 }),
  mkReport("2025-06-30", { netProfit: 14 }),
  mkReport("2025-03-31", { netProfit: 9 }),
  mkReport("2024-12-31", { netProfit: 8 }),
  mkReport("2024-09-30", { netProfit: 7 }),
];

// 主营构成全历史, 与服务端口径一致: 按报告期时间升序(最新期在最后, 供段名取 top)
// 缺 2025-03-31(测试 fallback 兜底); 2024-09-30 多出"黄酒"段(测试并入"其他")
const MAINOP: FinanceMain["mainopHistory"] = [
  { date: "2024-09-30", segments: [
    { name: "白酒", income: 40, profit: 5, margin: 0.5 },
    { name: "啤酒", income: 6, profit: 0.5, margin: 0.3 },
    { name: "黄酒", income: 3, profit: 0.3, margin: 0.4 },
  ] },
  { date: "2024-12-31", segments: [
    { name: "白酒", income: 50, profit: 6, margin: 0.5 },
    { name: "啤酒", income: 8, profit: 1, margin: 0.3 },
  ] },
  { date: "2025-06-30", segments: [
    { name: "白酒", income: 60, profit: 8, margin: 0.5 },
    { name: "啤酒", income: 10, profit: 1, margin: 0.3 },
  ] },
  { date: "2025-09-30", segments: [
    { name: "白酒", income: 70, profit: 9, margin: 0.5 },
    { name: "啤酒", income: 12, profit: 1, margin: 0.3 },
  ] },
  { date: "2025-12-31", segments: [
    { name: "白酒", income: 80, profit: 10, margin: 0.5 },
    { name: "啤酒", income: 15, profit: 2, margin: 0.3 },
    { name: "红酒", income: 5, profit: 0.5, margin: 0.4 },
  ] },
];

// 判别联合收窄助手(避免测试内断言)
function perfChart(chart: ChartLayout | null) {
  if (!chart || chart.mode !== "perf") throw new Error("chart 应为 perf 模式");
  return chart;
}
function qualityChart(chart: ChartLayout | null) {
  if (!chart || chart.mode !== "quality") throw new Error("chart 应为 quality 模式");
  return chart;
}
function leverageChart(chart: ChartLayout | null) {
  if (!chart || chart.mode !== "leverage") throw new Error("chart 应为 leverage 模式");
  return chart;
}

describe("computeChart 通用", () => {
  it("空报表返回 null", () => {
    expect(computeChart([], "perf", [], { w: W, h: H })).toBeNull();
    expect(computeChart([], "quality", [], { w: W, h: H })).toBeNull();
    expect(computeChart([], "leverage", [], { w: W, h: H })).toBeNull();
  });

  it("行按报告期时间正序(接口倒序翻转), 取最近 12 期", () => {
    const dates = ["2024-09-30", "2024-12-31", "2025-03-31", "2025-06-30", "2025-09-30", "2025-12-31"];
    for (const mode of ["perf", "quality", "leverage"] as const) {
      const chart = computeChart(REPORTS, mode, MAINOP, { w: W, h: H });
      expect(chart).not.toBeNull();
      expect(chart!.rows.map((r) => r.date)).toEqual(dates);
      expect(chart!.n).toBe(6);
    }
  });
});

describe("computeChart perf 模式", () => {
  const chart = perfChart(computeChart(REPORTS, "perf", MAINOP, { w: W, h: H }));
  const L = 32, R = 34, T = 8, B = 14;

  it("布局: 槽宽/刻度/零轴与极值对齐", () => {
    expect(chart.slot).toBeCloseTo((W - L - R) / 6, 5);
    expect(chart.ticks).toHaveLength(4);
    expect(chart.ticks[0].m).toBeCloseTo(80, 5); // mMax 100, 首档 0.2 处
    expect(chart.ticks[3].m).toBeCloseTo(20, 5);
    expect(chart.ticks[0].y).toBeCloseTo(T + 0.2 * (H - T - B), 5);
    expect(chart.Ym(100)).toBe(T); // 极值贴顶
    expect(chart.Ym(0)).toBeCloseTo(T + (H - T - B), 5); // 零轴贴底
    expect(chart.zeroY).toBeCloseTo(T + (H - T - B), 5);
    expect(chart.cx(0)).toBeLessThan(chart.cx(chart.n - 1));
    expect(chart.Ym(100)).toBeLessThan(chart.Ym(0)); // Y 单调递减
  });

  it("主营构成: 段名取最新期 top, 其余并入其他, 缺失期走 fallback", () => {
    expect(chart.segNames).toEqual(["白酒", "啤酒", "红酒", "其他"]);
    expect(chart.hasFallback).toBe(true);
    expect(chart.rows).toHaveLength(6);
    // 2024-09-30: 黄酒不在 top 名单 → 并入"其他"
    const r0 = chart.rows[0];
    expect(r0.date).toBe("2024-09-30");
    expect(r0.segs).toEqual([
      { name: "白酒", income: 40, profit: 5 },
      { name: "啤酒", income: 6, profit: 0.5 },
      { name: "红酒", income: 0, profit: 0 },
    ]);
    expect(r0.other).toEqual({ income: 3, profit: 0.3 });
    expect(r0.fallback).toBe(false);
    // 2025-03-31 无主营披露 → 财务全量兜底
    const fb = chart.rows[2];
    expect(fb.fallback).toBe(true);
    expect(fb.fullRev).toBe(100);
    expect(fb.fullNet).toBe(9);
    expect(fb.totalNet).toBe(9);
    expect(chart.rows[5].totalNet).toBe(15);
  });

  it("同比: 与 4 期前同名收入对比, 前期无收入为 null", () => {
    // (70/40-1, 12/6-1) 与 (80/50-1, 15/8-1); 浮点误差用 closeTo
    expect(chart.rows[4].yoy![0]).toBeCloseTo(75, 5);
    expect(chart.rows[4].yoy![1]).toBeCloseTo(100, 5);
    expect(chart.rows[4].yoy![2]).toBeNull();
    expect(chart.rows[5].yoy![0]).toBeCloseTo(60, 5);
    expect(chart.rows[5].yoy![1]).toBeCloseTo(87.5, 5);
    expect(chart.rows[5].yoy![2]).toBeNull();
    expect(chart.rows[3].yoy).toEqual([null, null, null]); // 前 4 期不计算
  });

  it("同比线 path 只含 M/L 且无 NaN", () => {
    for (const key of ["revYoy", "netYoy"] as const) {
      const d = chart.line(key);
      expect(d.startsWith("M")).toBe(true);
      expect(d).toContain("L");
      expect(d).not.toContain("NaN");
    }
  });

  it("右轴对数刻度: 标签为 ±百分比格式且在绘图区内", () => {
    expect(chart.pctTicks.length).toBeGreaterThan(0);
    for (const t of chart.pctTicks) {
      expect(t.label).toMatch(/^[+-]?\d+%$/);
      expect(t.y).toBeGreaterThanOrEqual(T - 2);
      expect(t.y).toBeLessThanOrEqual(T + (H - T - B) + 2);
    }
  });
});

describe("computeChart quality 模式", () => {
  const chart = qualityChart(computeChart(REPORTS, "quality", MAINOP, { w: W, h: H }));
  const T = 8;

  it("三序列: ROE/毛利/净利, 点串与端点值一致", () => {
    expect(chart.series.map((s) => s.key)).toEqual(["roe", "grossMargin", "netMargin"]);
    expect(chart.series.map((s) => s.name)).toEqual(["ROE", "毛利", "净利"]);
    for (const s of chart.series) {
      expect(s.pts.split(" ")).toHaveLength(chart.n);
      expect(s.lastV).toBe(chart.rows[chart.n - 1][s.key]);
    }
  });

  it("刻度 4 档且 v 递减; 端点标签均布在绘图区内", () => {
    expect(chart.ticks).toHaveLength(4);
    for (let i = 1; i < chart.ticks.length; i++) {
      expect(chart.ticks[i].v).toBeLessThan(chart.ticks[i - 1].v);
      expect(chart.ticks[i].y).toBeGreaterThan(chart.ticks[i - 1].y);
    }
    expect(chart.labels).toHaveLength(3);
    for (let i = 1; i < chart.labels.length; i++) {
      expect(chart.labels[i].labelY - chart.labels[i - 1].labelY).toBeCloseTo(11, 5);
    }
    for (const l of chart.labels) {
      expect(l.labelY).toBeGreaterThanOrEqual(T + 2);
      expect(l.labelY).toBeLessThanOrEqual(T + (H - 8 - 14) - 4);
    }
  });
});

describe("computeChart leverage 模式", () => {
  const chart = leverageChart(computeChart(REPORTS, "leverage", MAINOP, { w: W, h: H }));
  const L = 32, R = 50, T = 8, B = 14;
  const plotH = H - T - B;
  const slot = (W - L - R) / 6;

  it("资产负债率柱: 每期一根, 位置/宽度/值映射正确", () => {
    expect(chart.debtBars).toHaveLength(6);
    chart.debtBars.forEach((b, i) => {
      expect(b.x).toBeCloseTo(L + i * slot + slot / 2 - slot * 0.2, 5);
      expect(b.w).toBeCloseTo(slot * 0.4, 5);
      expect(b.v).toBe(50); // 全部 50%
      expect(b.y).toBeCloseTo(T, 5); // 50% 是左轴最大值 → 贴顶
    });
  });

  it("双轴: 左轴 % / 右轴元, 零轴同帧", () => {
    expect(chart.zeroL).toBeCloseTo(T + plotH, 5);
    expect(chart.ticks).toHaveLength(4);
    expect(chart.ticks[0].l).toBeCloseTo(40, 5);
    expect(chart.ticks[3].l).toBeCloseTo(10, 5);
    expect(chart.ticks[0].r).toBeCloseTo(0.4, 5);
    expect(chart.ticks[3].r).toBeCloseTo(0.1, 5);
    expect(chart.roicLine.split(" ")).toHaveLength(6);
    expect(chart.ocfLine.split(" ")).toHaveLength(6);
    expect(chart.roicLine).not.toContain("NaN");
    expect(chart.ocfLine).not.toContain("NaN");
  });
});
