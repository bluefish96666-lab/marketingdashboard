// AI 基础设施剪刀差图 — 纯计算(可单测)
import type { AiInfraPoint } from "@/lib/api";

export type SeriesKey = "capexB" | "grid" | "costPerM" | "pricePerM" | "roiPct";

export const SERIES_META: Record<SeriesKey, { label: string; color: string; unit: string; axis: "left" | "right"; dash?: boolean; note: string }> = {
  capexB: { label: "云巨头 CapEx", color: "#fbbf24", unit: "$B", axis: "right", note: "SEC 10-K 实测(PaymentsToAcquire*), 预测为模型外推" },
  grid: { label: "电网就绪度", color: "#34d399", unit: "指数", axis: "right", note: "LBNL 年度锚点+外推, 合成指数非官方" },
  costPerM: { label: "生产成本", color: "#fb7185", unit: "$/M", axis: "left", note: "厂商不披露, 公开研究估算" },
  pricePerM: { label: "售价", color: "#38bdf8", unit: "$/M", axis: "left", note: "2022-2024 定价史, 2025+ OpenRouter 实时均价" },
  roiPct: { label: "AI 专项 ROI", color: "#a78bfa", unit: "%", axis: "right", note: "年度(云AI增量+模型公司收入-AI capex)/AI capex; AI capex=总capex×AI占比" },
};

/** 对数刻度: 值 → 图内 y(线性映射到 log 域) */
export function logY(v: number, lo: number, hi: number, top: number, h: number): number {
  const lv = Math.log(Math.max(v, lo)), llo = Math.log(lo), lhi = Math.log(hi);
  return top + h - ((lv - llo) / (lhi - llo)) * h;
}

/** 计算 log 轴刻度(1/2/5 × 10^n 序列, 去重, 约 count 个) */
export function logTicks(lo: number, hi: number, count = 5): number[] {
  const ticks: number[] = [];
  const seen = new Set<number>();
  let mag = Math.pow(10, Math.floor(Math.log10(lo)));
  const step = [1, 2, 5, 10];
  let si = 0;
  while (ticks.length < count && mag <= hi * 1.1) {
    const v = mag * step[si];
    if (v >= lo * 0.9 && v <= hi * 1.1 && !seen.has(v)) { seen.add(v); ticks.push(v); }
    si++;
    if (si >= step.length) { si = 0; mag *= 10; }
  }
  return ticks;
}

/** 线性刻度(右轴 ROI) */
export function linY(v: number, lo: number, hi: number, top: number, h: number): number {
  return top + h - ((v - lo) / (hi - lo)) * h;
}

export function linTicks(lo: number, hi: number, count = 5): number[] {
  const out: number[] = [];
  for (let i = 0; i <= count; i++) out.push(+(lo + ((hi - lo) / count) * i).toFixed(1));
  return out;
}

/** 折线 path(实/虚分段由 actual 决定 — 返回两段 + 连接段) */
export function seriesPath(points: AiInfraPoint[], key: SeriesKey, X: (i: number) => number, Y: (v: number) => number): { actual: string; forecast: string; bridge: string } {
  let actual = "", forecast = "";
  let cur = "", curActual: boolean | null = null;
  let started = false;
  let lastActualSeg = "", firstForecastSeg = "";
  let sawActual = false, sawForecast = false;
  const flush = () => { if (!cur) return; if (curActual) actual += cur; else forecast += cur; };
  for (let i = 0; i < points.length; i++) {
    const v = points[i][key];
    if (v == null || !Number.isFinite(v)) { flush(); cur = ""; curActual = null; started = false; continue; }
    const a = points[i].actual;
    if (curActual !== a) { flush(); cur = ""; curActual = a; started = false; } // 边界: 新段用 M
    const cmd = started ? "L" : "M";
    cur += `${cmd}${X(i).toFixed(1)},${Y(v).toFixed(1)}`;
    if (a) { lastActualSeg = `${cmd}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; sawActual = true; }
    else { if (!sawForecast) { firstForecastSeg = `${cmd}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; sawForecast = true; } }
    started = true;
  }
  flush();
  // 连接段: 最后一个历史点 → 第一个预测点(填补 x 方向断口)
  const bridge = sawActual && sawForecast && lastActualSeg.startsWith("L")
    ? `M${lastActualSeg.slice(1)} L${firstForecastSeg.slice(1)}`
    : "";
  return { actual, forecast, bridge };
}

/** 单系列图布局计算: 返回坐标映射 + 刻度 */
export function computeLayout(points: AiInfraPoint[], key: SeriesKey, w: number, h: number) {
  const PL = 40, PR = 44, PT = 8, PB = 22;
  const iw = w - PL - PR, ih = h - PT - PB;
  const n = points.length;
  const X = (i: number) => PL + (i / Math.max(n - 1, 1)) * iw;
  const vals = points.map((p) => p[key]).filter((v): v is number => v != null && Number.isFinite(v));
  const rawLo = Math.min(...vals), rawHi = Math.max(...vals);
  const meta = SERIES_META[key];
  let Y: (v: number) => number;
  let ticks: number[];
  if (meta.axis === "left") {
    // 对数轴: 下限取 min 的 0.5 倍(留空间), 上限取 max 1.2 倍
    const lo = rawLo > 0 ? rawLo * 0.5 : 0.01;
    const hi = rawHi * 1.2;
    Y = (v) => logY(v, lo, hi, PT, ih);
    ticks = logTicks(lo, hi);
  } else {
    const lo = rawLo < 0 ? rawLo * 1.1 : rawLo * 0.9;
    const hi = rawHi > 0 ? rawHi * 1.1 : rawHi * 0.9;
    const pad = (hi - lo) * 0.08 || 1;
    const lo2 = lo - pad, hi2 = hi + pad;
    Y = (v) => linY(v, lo2, hi2, PT, ih);
    ticks = linTicks(lo2, hi2);
  }
  return { PL, PR, PT, PB, iw, ih, X, Y, ticks, rawLo, rawHi };
}

/** 剪刀差判定: price/cost 比值(毛利倍数) */
export function priceCostRatio(points: AiInfraPoint[]): { year: number; ratio: number }[] {
  return points
    .filter((p) => p.pricePerM > 0 && p.costPerM > 0)
    .map((p) => ({ year: p.year, ratio: +(p.pricePerM / p.costPerM).toFixed(1) }));
}
