import { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import { Panel, type PanelZoomProps } from "../Panel";
import { useFinMain } from "./useFinData";
import { type FinanceMain, type FinanceReport } from "@/lib/api";
import { useFin } from "./FinContext";
import { TNUM, quarterLabel, fmtYi } from "./utils";
import { clsChg, fmtPct } from "@/lib/format";
import { useElementSize } from "@/hooks/useElementSize";
import { AsyncContent, TabBar } from "../SharedUI";

type Tab = "perf" | "quality" | "leverage";
const TABS: { key: Tab; label: string }[] = [
  { key: "perf", label: "业绩" },
  { key: "quality", label: "质量" },
  { key: "leverage", label: "杠杆与回报" },
];

const GRID = "#1e293b";
const ZERO = "#334155";
const TICK = "#475569";
const AXIS = "#64748b";

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

function TrendChart({ reports, tab, mainopHistory }: { reports: FinanceReport[]; tab: Tab; mainopHistory: FinanceMain["mainopHistory"] }) {
  const { ref: boxRef, size } = useElementSize();
  const [hover, setHover] = useState(-1);

  const chart = useMemo(() => {
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
      const hist = mainopHistory || [];
      const src = hist.slice(-12);
      if (!src.length) return null;
      const latest = src[src.length - 1].segments;
      const topNames = latest.slice(0, 5).map((s) => s.name); // 段名按最新期收入取前5, 其余并"其他"
      const topSet = new Set(topNames);
      const per = src.map((r) => {
        const segs = topNames.map((name) => {
          const s = r.segments.find((x) => x.name === name);
          return { name, income: s?.income ?? 0, profit: s?.profit ?? 0 };
        });
        const other = r.segments.filter((s) => !topSet.has(s.name)).reduce(
          (a, s) => ({ income: a.income + s.income, profit: a.profit + s.profit }),
          { income: 0, profit: 0 }
        );
        return { date: r.date, segs, other, yoy: segs.map(() => null as number | null) };
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
        const pos = Math.max(sum(r.segs, (s) => Math.max(s.income, 0)) + Math.max(r.other.income, 0), sum(r.segs, (s) => Math.max(s.profit, 0)) + Math.max(r.other.profit, 0));
        const neg = Math.min(sum(r.segs, (s) => Math.min(s.income, 0)) + Math.min(r.other.income, 0), sum(r.segs, (s) => Math.min(s.profit, 0)) + Math.min(r.other.profit, 0));
        return { pos, neg };
      });
      const mMax = Math.max(...ext.map((e) => e.pos), 1);
      const mMin = Math.min(...ext.map((e) => e.neg), 0);
      // 右轴: 总营收/净利同比线, 对数坐标(log(1+同比): 比值变化翻倍/腰斩等距,
      // +693% 奇异值不再压扁常态; 同比 ≤ -100% 无意义, 过滤)
      const ly = (pct: number) => Math.log(1 + pct / 100);
      const pcts = rows.flatMap((r) => [r.revenueYoY, r.profitYoY]).filter((v) => v > -100);
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
      const line = (key: "revenueYoY" | "profitYoY") =>
        rows.map((r, i) => `${cx(i).toFixed(1)},${Yp(r[key]).toFixed(1)}`).join(" ");
      return { mode: "perf" as const, W, H, L, R, T, B, n, slot, cx, Ym, Yp, zeroY: Ym(0), ticks, pctTicks, rows: per, segNames: [...topNames, "其他"], line };
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
  }, [reports, tab, size]);

  if (!chart) return <div ref={boxRef} className="h-full min-h-0" />;
  const { W, H, L } = chart;
  const plotBottom = H - chart.B;
  const hovIdx = hover >= 0 ? Math.min(hover, chart.n - 1) : -1;
  const hov = hovIdx >= 0 ? chart.rows[hovIdx] : null;

  // 图例(按模式): 业绩 = 各主营段; 质量/杠杆 = 各自序列
  const legend: { label: string; cls: string; style?: React.CSSProperties }[] =
    chart.mode === "perf"
      ? [
          ...chart.segNames.map((name, i) => ({
            label: name,
            cls: "h-[7px] w-3 rounded-sm",
            style: { background: SEG_COLORS[i] },
          })),
          { label: "营收同比", cls: "w-4 border-t-2 border-dashed border-sky-400" },
          { label: "净利同比", cls: "w-4 border-t-2 border-rose-400" },
        ]
      : chart.mode === "quality"
        ? chart.series.map((s) => ({
            label: s.key === "roe" ? "ROE" : s.key === "grossMargin" ? "毛利率" : "净利率",
            cls: "w-4 border-t-2",
            style: { borderColor: s.color, borderStyle: s.dash ? "dashed" : "solid" },
          }))
        : [
            { label: "资产负债率", cls: "h-[7px] w-3 rounded-sm bg-amber-400/60" },
            { label: "ROIC", cls: "w-4 border-t-2 border-cyan-400" },
            { label: "每股OCF", cls: "w-4 border-t-2 border-dashed border-emerald-400" },
          ];

  // 悬停数值行(按模式): 业绩 = 各主营收入+同比+利润
  const hovLines = hov
    ? chart.mode === "perf"
      ? (() => {
          const p = hov as { segs: { name: string; income: number; profit: number }[]; other: { income: number; profit: number }; yoy: (number | null)[] };
          return [
            ...p.segs.map((s, si) => (
              <span key={s.name} className="flex items-center gap-1.5 text-slate-400" style={TNUM}>
                <span className="inline-block h-[6px] w-2 rounded-sm" style={{ background: SEG_COLORS[si] }} />
                {s.name} <b className="text-slate-200">{fmtYi(s.income)}</b>
                {p.yoy[si] != null && <i className={`not-italic ${clsChg(p.yoy[si]!)}`}>{fmtPct(p.yoy[si]!)}</i>}
                <span className="text-slate-500">利 {fmtYi(s.profit)}</span>
              </span>
            )),
            <span key="other" className="flex items-center gap-1.5 text-slate-400" style={TNUM}>
              <span className="inline-block h-[6px] w-2 rounded-sm" style={{ background: SEG_COLORS[SEG_COLORS.length - 1] }} />
              其他 <b className="text-slate-200">{fmtYi(p.other.income)}</b>
              <span className="text-slate-500">利 {fmtYi(p.other.profit)}</span>
            </span>,
          ];
        })()
      : (() => {
          const f = hov as FinanceReport;
          return chart.mode === "quality"
            ? [
                <span key="r" className="text-slate-400" style={TNUM}>ROE <b className="text-slate-200">{f.roe.toFixed(1)}%</b></span>,
                <span key="g" className="text-slate-400" style={TNUM}>毛利率 <b className="text-slate-200">{f.grossMargin.toFixed(1)}%</b></span>,
                <span key="n" className="text-slate-400" style={TNUM}>净利率 <b className="text-slate-200">{f.netMargin.toFixed(1)}%</b></span>,
              ]
            : [
                <span key="d" className="text-slate-400" style={TNUM}>资产负债率 <b className="text-slate-200">{f.debtRatio.toFixed(1)}%</b></span>,
                <span key="r" className="text-slate-400" style={TNUM}>ROIC <b className="text-slate-200">{f.roic.toFixed(1)}%</b></span>,
                <span key="o" className="text-slate-400" style={TNUM}>每股OCF <b className="text-slate-200">{f.ocfPerShare.toFixed(2)}</b></span>,
              ];
        })()
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 图例 */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-0.5 px-0.5 pb-0.5 text-[9px] text-slate-500">
        {legend.map((l) => (
          <span key={l.label} className="flex items-center gap-1">
            <span className={l.cls} style={l.style} />
            {l.label}
          </span>
        ))}
      </div>
      <div ref={boxRef} className="relative min-h-0 flex-1">
      <svg width={W} height={H} className="block"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          setHover(Math.max(0, Math.min(chart.n - 1, Math.floor((x - chart.L) / chart.slot))));
        }}
        onMouseLeave={() => setHover(-1)}>
        {/* 网格 + 左右轴刻度 */}
        {chart.mode === "perf"
          ? chart.ticks.map((t, i) => (
              <g key={i}>
                <line x1={L} y1={t.y} x2={W - chart.R} y2={t.y} stroke={GRID} strokeWidth={1} />
                <text x={L - 3} y={t.y + 3} fontSize={9} fill={AXIS} textAnchor="end" style={TNUM}>
                  {(t.m / 1e8).toFixed(0)}亿
                </text>
              </g>
            ))
          : chart.mode === "leverage"
          ? chart.ticks.map((t, i) => (
              <g key={i}>
                <line x1={L} y1={t.y} x2={W - chart.R} y2={t.y} stroke={GRID} strokeWidth={1} />
                <text x={L - 3} y={t.y + 3} fontSize={9} fill={AXIS} textAnchor="end" style={TNUM}>
                  {t.l.toFixed(0)}%
                </text>
                <text x={W - chart.R + 3} y={t.y + 3} fontSize={9} fill={AXIS} style={TNUM}>
                  {t.r.toFixed(1)}
                </text>
              </g>
            ))
          : chart.ticks.map((t, i) => (
              <g key={i}>
                <line x1={L} y1={t.y} x2={W - chart.R} y2={t.y} stroke={GRID} strokeWidth={1} />
                <text x={L - 3} y={t.y + 3} fontSize={9} fill={AXIS} textAnchor="end" style={TNUM}>
                  {t.v.toFixed(0)}%
                </text>
              </g>
            ))}
        {/* 零轴(加粗) */}
        {(chart.mode === "perf" || chart.mode === "leverage") && (
          <line x1={L} y1={chart.mode === "perf" ? chart.zeroY : chart.zeroL} x2={W - chart.R} y2={chart.mode === "perf" ? chart.zeroY : chart.zeroL} stroke={ZERO} strokeWidth={1.5} />
        )}
        {/* X 刻度: 隔期标注 */}
        {chart.rows.map((r, i) =>
          i % 2 === 0 ? (
            <text key={r.date} x={chart.cx(i)} y={H - 4} fontSize={9} fill={TICK} textAnchor="middle" style={TNUM}>
              {quarterLabel(r.date)}
            </text>
          ) : null
        )}
        {chart.mode === "perf" ? (
          <>
            {/* 主营构成堆叠柱: 每期两根(左=营收构成, 右=利润构成), 段色固定 */}
            {chart.rows.map((r, i) => {
              const bw = chart.slot * 0.22;
              const revX = chart.cx(i) - bw - 2;
              const npX = chart.cx(i) + 2;
              const color = (si: number) => SEG_COLORS[Math.min(si, SEG_COLORS.length - 1)];
              // 堆叠: 正值向上, 负值(亏损段)从零轴向下
              const stack = (x: number, items: { name: string; v: number }[]) => {
                let accPos = 0;
                let accNeg = 0;
                return items.map((it, si) => {
                  if (it.v >= 0) {
                    const y = chart.Ym(accPos + it.v);
                    const h = Math.max(chart.Ym(accPos) - y, 1);
                    accPos += it.v;
                    return <rect key={`${r.date}-${si}`} x={x} y={y} width={bw} height={h} fill={color(si)} opacity={0.85} />;
                  }
                  const y = chart.Ym(accNeg);
                  const h = Math.max(chart.Ym(accNeg + it.v) - chart.Ym(accNeg), 1);
                  accNeg += it.v;
                  return <rect key={`${r.date}-${si}`} x={x} y={y} width={bw} height={h} fill={color(si)} opacity={0.85} />;
                });
              };
              return (
                <g key={r.date}>
                  {stack(revX, [...r.segs.map((s) => ({ name: s.name, v: s.income })), { name: "其他", v: r.other.income }])}
                  {stack(npX, [...r.segs.map((s) => ({ name: s.name, v: s.profit })), { name: "其他", v: r.other.profit }])}
                </g>
              );
            })}
            {/* 总营收/净利同比线(右轴, 对数坐标): 净利同比 rose 实线 / 营收同比 sky 虚线 */}
            <polyline points={chart.line("revenueYoY")} fill="none" stroke="#38bdf8" strokeWidth={1.2} strokeDasharray="3 2" strokeLinejoin="round" />
            <polyline points={chart.line("profitYoY")} fill="none" stroke="#fb7185" strokeWidth={1.4} strokeLinejoin="round" />
            {/* 右轴对数刻度(0%/±100%…, 2 倍比) */}
            {chart.pctTicks.map((t) => (
              <text key={t.label} x={W - chart.R + 3} y={t.y + 3} fontSize={9} fill={AXIS} style={TNUM}>
                {t.label}
              </text>
            ))}
          </>
        ) : chart.mode === "quality" ? (
          <>
            {chart.series.map((s) => (
              <polyline
                key={s.key}
                points={s.pts}
                fill="none"
                stroke={s.color}
                strokeWidth={1.4}
                strokeDasharray={s.dash}
                strokeLinejoin="round"
              />
            ))}
            {/* 端点标签 + 标线 */}
            {chart.labels.map((l) => (
              <g key={l.s.key}>
                <line
                  x1={W - chart.R - 4}
                  y1={l.s.lastY}
                  x2={W - chart.R + 2}
                  y2={l.labelY}
                  stroke={l.s.color}
                  strokeWidth={0.6}
                  strokeOpacity={0.5}
                />
                <text x={W - chart.R + 4} y={l.labelY + 3} fontSize={10} fill={l.s.color} style={TNUM}>
                  {l.s.name} {l.s.lastV.toFixed(1)}
                </text>
              </g>
            ))}
          </>
        ) : null}
        {chart.mode === "leverage" && (
          <>
            {/* 资产负债率柱: amber 填充, 越低越好 */}
            {chart.debtBars.map((b, i) => {
              const top = Math.min(b.y, chart.zeroL);
              const h = Math.max(Math.abs(chart.zeroL - b.y), b.v > 0 ? 1 : 0);
              return (
                <rect
                  key={`debt-${i}`}
                  x={b.x}
                  y={top}
                  width={b.w}
                  height={h}
                  rx={1}
                  fill="#fbbf24"
                  opacity={0.55}
                />
              );
            })}
            {/* ROIC 线: cyan 实线, 左轴% */}
            <polyline points={chart.roicLine} fill="none" stroke="#22d3ee" strokeWidth={1.4} strokeLinejoin="round" />
            {/* 每股OCF 线: emerald 虚线, 右轴元 */}
            <polyline points={chart.ocfLine} fill="none" stroke="#34d399" strokeWidth={1.2} strokeDasharray="3 2" strokeLinejoin="round" />
            {/* 右端点标签 */}
            {(() => {
              const last = chart.rows[chart.n - 1];
              const roicY = chart.Yl(last.roic);
              const ocfY = chart.Yl(last.ocfPerShare);
              return (
                <>
                  <text x={W - chart.R + 4} y={roicY + 3} fontSize={9} fill="#22d3ee" style={TNUM}>
                    ROIC {last.roic.toFixed(1)}%
                  </text>
                  <text x={W - chart.R + 4} y={ocfY + 3} fontSize={9} fill="#34d399" style={TNUM}>
                    OCF {last.ocfPerShare.toFixed(2)}
                  </text>
                </>
              );
            })()}
          </>
        )}
        {/* 轴底线 */}
        <line x1={L} y1={plotBottom} x2={W - chart.R} y2={plotBottom} stroke={GRID} strokeWidth={1} />
        {/* 悬停十字线 */}
        {hovIdx >= 0 && (
          <line x1={chart.cx(hovIdx)} y1={chart.T} x2={chart.cx(hovIdx)} y2={plotBottom} stroke="#475569" strokeWidth={1} strokeDasharray="3 3" />
        )}
      </svg>
      {/* 悬停数值 */}
      {hov && hovLines && (
        <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 rounded border border-slate-700/60 bg-[#0b1120]/95 px-2 py-1 text-[9px] leading-4 shadow">
          <div className="font-semibold text-slate-200">{quarterLabel(hov.date)}</div>
          <div className={chart.mode === "perf" ? "flex flex-col gap-0.5" : "flex items-center gap-2"}>{hovLines}</div>
        </div>
      )}
      </div>
    </div>
  );
}

/** 公司趋势: 业绩(分组柱+同比双轴) | 质量(ROE/毛利率/净利率) */
export function FinTrendPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const [tab, setTab] = useState<Tab>("perf");
  const { company } = useFin();
  const { data, error, loading, retry } = useFinMain(company.code);

  return (
    <Panel
      className={className}
      {...zoomProps}
      title="公司趋势"
      icon={<TrendingUp size={14} />}
      accent="#22d3ee"
      right={
        <TabBar tabs={TABS} active={tab} onChange={setTab} accent="cyan" />
      }
    >
      {!company.code ? (
        // 灰化示例骨架 + 引导文案(默认选中贵州茅台, 正常不会进入)
        <div className="relative h-full p-3">
          <div className="flex h-full items-end gap-2 opacity-40">
            {[40, 55, 38, 62, 48, 70, 58, 76, 66, 82, 74, 90].map((h, i) => (
              <div key={i} className="flex-1 rounded-sm bg-slate-700/50" style={{ height: `${h}%` }} />
            ))}
          </div>
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-600">
            ← 先在左侧选择公司
          </div>
        </div>
      ) : (
        <AsyncContent loading={loading} error={error} empty={!!data && data.reports.length === 0} emptyMessage="暂无财报数据" onRetry={retry}>
          {data && data.reports.length > 0 && <TrendChart reports={data.reports} mainopHistory={data.mainopHistory} tab={tab} />}
        </AsyncContent>
      )}
    </Panel>
  );
}
