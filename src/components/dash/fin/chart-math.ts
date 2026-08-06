// 财报趋势图计算 — 纯函数, 与渲染分离(可单测)
import type { FinanceMain, FinanceReport } from "@/lib/api";

export type ChartTab = "perf" | "quality" | "leverage";

const GRID = "#1e293b";
const ZERO = "#334155";
const TICK = "#475569";
const AXIS = "#64748b";
export { GRID, ZERO, TICK, AXIS };

/** 扩展双侧值域使零轴同帧(柱转负/线穿零同一水平线可读) */
function alignZero(aMin: number, aMax: number, bMin: number, bMax: number) {
  const frac = (min: number, max: number) => (max > min && min < 0 ? -min / (max - min) : 0);
  const f = Math.min(Math.max(frac(aMin, aMax), frac(bMin, bMax)), 0.9);
  const adj = (min: number, max: number): [number, number] => {
    if (max <= min) return [min, min + 1];
    if (f <= 0) return [Math.min(min, 0), max];
    if (min >= 0) return [(-f * max) / (1 - f), max];
    const cur = -min / (max - min);
    if (cur < f) return [(-f * max) / (1 - f), max];
    if (cur > f) return [min, (-min * (1 - f)) / f];
    return [min, max];
  };
  return [adj(aMin, aMax), adj(bMin, bMax)] as const;
}

// 主营构成堆叠柱的段色: 验证过的深色分类调色板(蓝/橙/青/黄/品红 + 其他灰), 相邻 CVD 分离达标
const SEG_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#64748b"];
export { SEG_COLORS };

export type ChartLayout =
  | {
      mode: "perf";
      W: number; H: number; L: number; R: number; T: number; B: number;
      n: number; slot: number;
      cx: (i: number) => number;
      Ym: (v: number) => number; Yp: (v: number) => number;
      zeroY: number;
      ticks: { y: number; m: number }[];
      pctTicks: { y: number; label: string }[];
      rows: any[];
      segNames: string[];
      hasFallback: boolean;
      line: (key: "revYoy" | "netYoy") => string;
    }
  | {
      mode: "quality";
      W: number; H: number; L: number; R: number; T: number; B: number;
      n: number; slot: number;
      cx: (i: number) => number;
      ticks: { y: number; v: number }[];
      rows: FinanceReport[];
      series: { key: "roe" | "grossMargin" | "netMargin"; name: string; color: string; dash?: string; pts: string; lastY: number; lastV: number }[];
      labels: { s: any; labelY: number }[];
    }
  | {
      mode: "leverage";
      W: number; H: number; L: number; R: number; T: number; B: number;
      n: number; slot: number;
      cx: (i: number) => number;
      ticks: { y: number; l: number; r: number }[];
      rows: FinanceReport[];
      debtBars: { x: number; w: number; v: number; y: number }[];
      roicLine: string;
      ocfLine: string;
      zeroL: number;
      Yl: (v: number) => number;
    };

/** 三模式图表全量计算(业绩堆叠/质量折线/杠杆双轴) — 纯函数, 输入 reports+tab+容器尺寸 */
export function computeChart(
  reports: FinanceReport[],
  tab: ChartTab,
  mainopHistory: FinanceMain["mainopHistory"],
  size: { w: number; h: number }
): ChartLayout | null {
  const rows = reports.slice(0, 12).reverse(); // 接口为报告期倒序, 翻转为时间正序
  if (!rows.length) return null;
  const n = rows.length;
  const { w: W, h: H } = size;
  const L = 32;
  const R = tab === "quality" ? 56 : tab === "leverage" ? 50 : 34;
  const T = 8;
  const B = 14;
  const plotW = W - L - R;
  const plotH = H - T - B;
  const slot = plotW / n;
  const cx = (i: number) => L + i * slot + slot / 2;

  if (tab === "perf") {
    // 业绩: 主营构成堆叠柱(每期两根: 营收构成/利润构成) + 各主营同比
    // X 轴对齐财务报告期(reports), 主营构成按报告期匹配 — 与质量/杠杆页签同窗口;
    // 某期无主营构成披露时(上游 zygcfx 滞后), 用财务全量(总营收/归母净利)画斜纹柱兜底
    const hist = mainopHistory || [];
    const byDate = new Map(hist.map((h) => [h.date, h]));
    const latestSegs = (() => {
      for (let i = hist.length - 1; i >= 0; i--) if (hist[i].segments.length) return hist[i].segments;
      return [];
    })();
    const topNames = latestSegs.slice(0, 5).map((s) => s.name); // 段名按最新有数据期的收入取前5, 其余并"其他"
    const topSet = new Set(topNames);
    const per = rows.map((r) => {
      const m = byDate.get(r.date);
      const segs = topNames.map((name) => {
        const s = m?.segments.find((x) => x.name === name);
        return { name, income: s?.income ?? 0, profit: s?.profit ?? 0 };
      });
      const other = (m?.segments ?? []).filter((s) => !topSet.has(s.name)).reduce(
        (a, s) => ({ income: a.income + s.income, profit: a.profit + s.profit }),
        { income: 0, profit: 0 }
      );
      // 合计净利(公司整体): 主营构成只统计主营段, 期间费用/减值等亏空不在其中
      // 某期无主营构成 → fallback: 用财报全量(总营收/归母净利)画单段斜纹柱
      const fallback = !m || m.segments.length === 0;
      return {
        date: r.date,
        segs,
        other,
        totalNet: r.netProfit ?? null,
        revYoy: r.revenueYoY ?? null,
        netYoy: r.profitYoY ?? null,
        yoy: segs.map(() => null as number | null),
        fallback,
        fullRev: fallback ? r.revenue ?? 0 : 0,
        fullNet: fallback ? r.netProfit ?? 0 : 0,
      };
    });
    // 各主营同比: 与 4 期前(去年同期)同名收入对比
    for (let i = 4; i < per.length; i++) {
      per[i].segs.forEach((s, si) => {
        const prev = per[i - 4].segs[si].income;
        if (prev > 0) per[i].yoy[si] = (s.income / prev - 1) * 100;
      });
    }
    // Y 范围: 正向合计(上)与负向合计(下) — 亏损主营段向下画柱
    const ext = per.map((r) => {
      const sum = (arr: { income: number; profit: number }[], pick: (s: { income: number; profit: number }) => number) =>
        arr.reduce((a, s) => a + pick(s), 0);
      // 全量兜底期把财务全量计入极值(正负两个方向)
      const pos = Math.max(
        sum(r.segs, (s) => Math.max(s.income, 0)) + Math.max(r.other.income, 0) + Math.max(r.fullRev, 0),
        sum(r.segs, (s) => Math.max(s.profit, 0)) + Math.max(r.other.profit, 0) + Math.max(r.fullNet, 0)
      );
      const neg = Math.min(
        sum(r.segs, (s) => Math.min(s.income, 0)) + Math.min(r.other.income, 0) + Math.min(r.fullRev, 0),
        sum(r.segs, (s) => Math.min(s.profit, 0)) + Math.min(r.other.profit, 0) + Math.min(r.fullNet, 0)
      );
      return { pos, neg };
    });
    const mMax = Math.max(...ext.map((e) => e.pos), 1);
    const mMin = Math.min(...ext.map((e) => e.neg), 0);
    // 业绩页签 X 轴统一为主营构成报告期(柱/标记/同比线同坐标)
    const pn = per.length;
    const pSlot = plotW / pn;
    const pcx = (i: number) => L + i * pSlot + pSlot / 2;
    // 右轴: 总营收/净利同比线, 对数坐标(log(1+同比): 比值变化翻倍/腰斩等距,
    // +693% 奇异值不再压扁常态; 同比 ≤ -100% 无意义, 过滤)
    const ly = (pct: number) => Math.log(1 + pct / 100);
    const pcts = per.flatMap((r) => [r.revYoy, r.netYoy]).filter((v): v is number => v != null && v > -100);
    const lyMin = Math.min(...pcts.map(ly), 0);
    const lyMax = Math.max(...pcts.map(ly), 0) || 1;
    const Ym = (v: number) => T + (1 - (v - mMin) / (mMax - mMin)) * plotH;
    const Yp = (v: number) => T + (1 - (ly(v) - lyMin) / (lyMax - lyMin)) * plotH;
    const gridFracs = [0.2, 0.4, 0.6, 0.8];
    const ticks = gridFracs.map((f) => ({ y: T + f * plotH, m: mMax - f * (mMax - mMin) }));
    // 右轴对数刻度: 比值 2^k → 0%/+100%/+300%/+700%…
    const pctTicks: { y: number; label: string }[] = [];
    for (let k = -2; k <= 6; k++) {
      const pct = (2 ** k - 1) * 100;
      const y = Yp(pct);
      if (y < T - 2 || y > T + plotH + 2) continue;
      pctTicks.push({ y, label: `${pct > 0 ? "+" : ""}${pct}%` });
    }
    // 同比线: 与柱同坐标, 无匹配期/无效值断线
    const line = (key: "revYoy" | "netYoy") => {
      let d = "";
      let started = false;
      per.forEach((r, i) => {
        const v = r[key];
        if (v == null || v <= -100) { started = false; return; }
        d += `${started ? "L" : "M"}${pcx(i).toFixed(1)},${Yp(v).toFixed(1)}`;
        started = true;
      });
      return d;
    };
    return { mode: "perf" as const, W, H, L, R, T, B, n: pn, slot: pSlot, cx: pcx, Ym, Yp, zeroY: Ym(0), ticks, pctTicks, rows: per, segNames: per.some((r) => !r.fallback) ? [...topNames, "其他"] : [...topNames], hasFallback: per.some((r) => r.fallback), line };
  }

  if (tab === "quality") {
    // quality: ROE / 毛利率 / 净利率 共用百分比轴
    const vals = rows.flatMap((r) => [r.roe, r.grossMargin, r.netMargin]);
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    const pad = (max - min) * 0.06 || 1;
    min -= pad;
    max += pad;
    const Y = (v: number) => T + (1 - (v - min) / (max - min)) * plotH;
    const ticks = [0.2, 0.4, 0.6, 0.8].map((f) => ({ y: T + f * plotH, v: max - f * (max - min) }));
    const series = [
      { key: "roe" as const, name: "ROE", color: "#22d3ee", dash: undefined as string | undefined },
      { key: "grossMargin" as const, name: "毛利", color: "#fbbf24", dash: undefined as string | undefined },
      { key: "netMargin" as const, name: "净利", color: "#fb7185", dash: "3 2" },
    ].map((s) => ({
      ...s,
      pts: rows.map((r, i) => `${cx(i).toFixed(1)},${Y(r[s.key]).toFixed(1)}`).join(" "),
      lastY: Y(rows[n - 1][s.key]),
      lastV: rows[n - 1][s.key],
    }));
    // 端点标签均布压缩(沿用 BoardFlowChart 算法)
    const labels = [...series].sort((a, b) => a.lastY - b.lastY).map((s) => ({ s, labelY: s.lastY }));
    const TOP = T + 2;
    const BOTTOM = T + plotH - 4;
    const gap = labels.length > 1 ? Math.min(11, (BOTTOM - TOP) / (labels.length - 1)) : 11;
    let sy = Math.max(labels[0]?.labelY ?? TOP, TOP);
    sy = Math.min(sy, BOTTOM - gap * (labels.length - 1));
    sy = Math.max(sy, TOP);
    for (const l of labels) {
      l.labelY = sy;
      sy += gap;
    }
    return { mode: "quality" as const, W, H, L, R, T, B, n, slot, cx, ticks, rows, series, labels };
  }

  // leverage: 资产负债率(柱,左轴%) + ROIC(线,左轴%) + 每股OCF(线,右轴元) 双轴图
  const debtVals = rows.map((r) => r.debtRatio);
  const roicVals = rows.map((r) => r.roic);
  const ocfVals = rows.map((r) => r.ocfPerShare);
  const [[lMin, lMax], [rMin, rMax]] = alignZero(
    Math.min(...debtVals, ...roicVals, 0),
    Math.max(...debtVals, ...roicVals, 1),
    Math.min(...ocfVals, 0),
    Math.max(...ocfVals, 0) || 1
  );
  const Yl = (v: number) => T + (1 - (v - lMin) / (lMax - lMin)) * plotH;
  const Yr = (v: number) => T + (1 - (v - rMin) / (rMax - rMin)) * plotH;
  const levTicks = [0.2, 0.4, 0.6, 0.8].map((f) => ({
    y: T + f * plotH,
    l: lMax - f * (lMax - lMin),
    r: rMax - f * (rMax - rMin),
  }));
  const debtBars = rows.map((r, i) => ({
    x: cx(i) - slot * 0.2,
    w: slot * 0.4,
    v: r.debtRatio,
    y: Yl(r.debtRatio),
  }));
  const roicLine = rows.map((r, i) => `${cx(i).toFixed(1)},${Yl(r.roic).toFixed(1)}`).join(" ");
  const ocfLine = rows.map((r, i) => `${cx(i).toFixed(1)},${Yr(r.ocfPerShare).toFixed(1)}`).join(" ");
  const zeroL = Yl(0);
  return {
    mode: "leverage" as const, W, H, L, R, T, B, n, slot, cx, ticks: levTicks, rows,
    debtBars, roicLine, ocfLine, zeroL, Yl,
  };
}
