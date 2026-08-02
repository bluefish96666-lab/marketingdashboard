import { useEffect, useMemo, useRef, useState } from "react";
import { Panel, type PanelZoomProps } from "../Panel";
import { usePolling } from "@/hooks/usePolling";
import { api, type FinanceReport } from "@/lib/api";
import { useFin } from "./FinContext";
import { TNUM, quarterLabel } from "./utils";

type Tab = "perf" | "quality";
const TABS: { key: Tab; label: string }[] = [
  { key: "perf", label: "业绩" },
  { key: "quality", label: "质量" },
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

function TrendChart({ reports, tab }: { reports: FinanceReport[]; tab: Tab }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 500, h: 260 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => {
      const r = es[0].contentRect;
      if (r.width > 60 && r.height > 60) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const chart = useMemo(() => {
    const rows = reports.slice(0, 12).reverse(); // 接口为报告期倒序, 翻转为时间正序
    if (!rows.length) return null;
    const n = rows.length;
    const { w: W, h: H } = size;
    const L = 32;
    const R = tab === "quality" ? 56 : 34;
    const T = 8;
    const B = 14;
    const plotW = W - L - R;
    const plotH = H - T - B;
    const slot = plotW / n;
    const cx = (i: number) => L + i * slot + slot / 2;

    if (tab === "perf") {
      const money = rows.flatMap((r) => [r.revenue, r.netProfit]);
      const pcts = rows.flatMap((r) => [r.revenueYoY, r.profitYoY]);
      const [[mMin, mMax], [pMin, pMax]] = alignZero(
        Math.min(...money, 0),
        Math.max(...money, 0) || 1,
        Math.min(...pcts, 0),
        Math.max(...pcts, 0) || 1
      );
      const Ym = (v: number) => T + (1 - (v - mMin) / (mMax - mMin)) * plotH;
      const Yp = (v: number) => T + (1 - (v - pMin) / (pMax - pMin)) * plotH;
      const gridFracs = [0.2, 0.4, 0.6, 0.8];
      const ticks = gridFracs.map((f) => ({
        y: T + f * plotH,
        m: mMax - f * (mMax - mMin),
        p: pMax - f * (pMax - pMin),
      }));
      const line = (key: "revenueYoY" | "profitYoY") =>
        rows.map((r, i) => `${cx(i).toFixed(1)},${Yp(r[key]).toFixed(1)}`).join(" ");
      return { mode: "perf" as const, W, H, L, R, T, B, n, slot, cx, Ym, zeroY: Ym(0), ticks, rows, line };
    }

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
  }, [reports, tab, size]);

  if (!chart) return <div ref={boxRef} className="h-full min-h-0" />;
  const { W, H, L } = chart;
  const plotBottom = H - chart.B;

  return (
    <div ref={boxRef} className="h-full min-h-0">
      <svg width={W} height={H} className="block">
        {/* 网格 + 左右轴刻度 */}
        {chart.mode === "perf"
          ? chart.ticks.map((t, i) => (
              <g key={i}>
                <line x1={L} y1={t.y} x2={W - chart.R} y2={t.y} stroke={GRID} strokeWidth={1} />
                <text x={L - 3} y={t.y + 3} fontSize={8} fill={AXIS} textAnchor="end" style={TNUM}>
                  {(t.m / 1e8).toFixed(0)}亿
                </text>
                <text x={W - chart.R + 3} y={t.y + 3} fontSize={8} fill={AXIS} style={TNUM}>
                  {t.p.toFixed(0)}%
                </text>
              </g>
            ))
          : chart.ticks.map((t, i) => (
              <g key={i}>
                <line x1={L} y1={t.y} x2={W - chart.R} y2={t.y} stroke={GRID} strokeWidth={1} />
                <text x={L - 3} y={t.y + 3} fontSize={8} fill={AXIS} textAnchor="end" style={TNUM}>
                  {t.v.toFixed(0)}%
                </text>
              </g>
            ))}
        {/* 零轴(加粗) */}
        {chart.mode === "perf" && (
          <line x1={L} y1={chart.zeroY} x2={W - chart.R} y2={chart.zeroY} stroke={ZERO} strokeWidth={1.5} />
        )}
        {/* X 刻度: 隔期标注 */}
        {chart.rows.map((r, i) =>
          i % 2 === 0 ? (
            <text key={r.date} x={chart.cx(i)} y={H - 4} fontSize={8} fill={TICK} textAnchor="middle" style={TNUM}>
              {quarterLabel(r.date)}
            </text>
          ) : null
        )}
        {chart.mode === "perf" ? (
          <>
            {/* 分组柱: 营收 cyan 宽条 / 净利 amber 窄条 */}
            {chart.rows.map((r, i) => {
              const revW = chart.slot * 0.4;
              const npW = chart.slot * 0.22;
              const revX = chart.cx(i) - revW - 1;
              const npX = chart.cx(i) + 1;
              const bars = [
                { x: revX, w: revW, v: r.revenue, fill: "#22d3ee", op: 0.85 },
                { x: npX, w: npW, v: r.netProfit, fill: "#fbbf24", op: 0.9 },
              ];
              return bars.map((b, bi) => {
                const y = chart.Ym(b.v);
                const top = Math.min(y, chart.zeroY);
                const h = Math.max(Math.abs(chart.zeroY - y), b.v !== 0 ? 1 : 0);
                return <rect key={`${r.date}-${bi}`} x={b.x} y={top} width={b.w} height={h} fill={b.fill} opacity={b.op} />;
              });
            })}
            {/* 同比折线(右轴): 净利同比 rose 实线 / 营收同比 sky 虚线 */}
            <polyline points={chart.line("revenueYoY")} fill="none" stroke="#38bdf8" strokeWidth={1.2} strokeDasharray="3 2" strokeLinejoin="round" />
            <polyline points={chart.line("profitYoY")} fill="none" stroke="#fb7185" strokeWidth={1.4} strokeLinejoin="round" />
          </>
        ) : (
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
                <text x={W - chart.R + 4} y={l.labelY + 3} fontSize={8.5} fill={l.s.color} style={TNUM}>
                  {l.s.name} {l.s.lastV.toFixed(1)}
                </text>
              </g>
            ))}
          </>
        )}
        {/* 轴底线 */}
        <line x1={L} y1={plotBottom} x2={W - chart.R} y2={plotBottom} stroke={GRID} strokeWidth={1} />
      </svg>
    </div>
  );
}

/** 公司趋势: 业绩(分组柱+同比双轴) | 质量(ROE/毛利率/净利率) */
export function FinTrendPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const [tab, setTab] = useState<Tab>("perf");
  const [retry, setRetry] = useState(0);
  const { company } = useFin();
  const { data, error, loading } = usePolling(() => api.financeMain(company.code), 1800000, [company.code, retry]);

  return (
    <Panel
      className={className}
      {...zoomProps}
      title="公司趋势"
      icon="◧"
      accent="#22d3ee"
      right={
        <div className="flex items-center gap-2 text-[10px]">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`border-b-2 px-1 pb-px leading-[16px] ${
                tab === t.key ? "border-cyan-400 text-cyan-300" : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
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
      ) : !data ? (
        <div className="flex h-full items-center justify-center text-[11px]">
          {loading ? (
            <span className="text-slate-600">数据加载中…</span>
          ) : (
            <button className="h-full w-full text-slate-500" onClick={() => setRetry((r) => r + 1)}>
              数据获取失败，点击重试{error ? `(${error})` : ""}
            </button>
          )}
        </div>
      ) : data.reports.length === 0 ? (
        <div className="flex h-full items-center justify-center text-[11px] text-slate-600">暂无财报数据</div>
      ) : (
        <TrendChart reports={data.reports} tab={tab} />
      )}
    </Panel>
  );
}
