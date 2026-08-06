import { useEffect, useMemo, useRef, useState, Fragment } from "react";
import { Cpu } from "lucide-react";
import { Panel, type PanelZoomProps } from "./Panel";
import { useOpenRouterUsage } from "@/lib/api";
import type { OrUsageDay } from "@/lib/api";

function fmtT(t: number): string {
  if (t >= 1e12) return (t / 1e12).toFixed(1) + "T";
  if (t >= 1e9) return (t / 1e9).toFixed(1) + "B";
  if (t >= 1e6) return (t / 1e6).toFixed(1) + "M";
  return String(t);
}

const PALETTE = [
  "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
  "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac",
  "#86bcb6", "#d4a6c8", "#f1ce63", "#a0cbe8", "#e377c2",
  "#7f7f7f", "#00bcd4", "#ff5722", "#8bc34a",
];

// 已知厂商/分组的固定配色(保持原视觉)
const KNOWN_COLORS: Record<string, string> = {
  腾讯: "#4e79a7", 小米: "#f28e2b", DeepSeek: "#e15759", Anthropic: "#76b7b2",
  Google: "#59a14f", OpenAI: "#edc948", 智谱GLM: "#b07aa1", 月之暗面: "#ff9da7",
  MiniMax: "#9c755f", 阶跃星辰: "#bab0ac", NVIDIA: "#86bcb6", Mistral: "#d4a6c8",
  Meta: "#f1ce63", xAI: "#a0cbe8", Cohere: "#e377c2", 通义千问: "#7f7f7f",
  Poolside: "#00bcd4", inclusionai: "#ff5722", "nex-agi": "#8bc34a",
  其他: "#64748b", "🇨🇳中国": "#ef4444", "🇺🇸美国": "#3b82f6", "🌍其他": "#64748b",
};

/** 名字→颜色: 已知用固定色, 未知按名字哈希从调色板稳定取色 */
function vendorColor(name: string): string {
  const known = KNOWN_COLORS[name];
  if (known) return known;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  const fmt = (n: number) => n.toFixed(1);
  let d = `M${fmt(pts[0].x)},${fmt(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const t = 0.3;
    d += `C${fmt(p1.x + (p2.x - p0.x) * t)},${fmt(p1.y + (p2.y - p0.y) * t)} ${fmt(p2.x - (p3.x - p1.x) * t)},${fmt(p2.y - (p3.y - p1.y) * t)} ${fmt(p2.x)},${fmt(p2.y)}`;
  }
  return d;
}

const TOP_N = 15;

function Chart({ allDays, days, mode, agg }: { allDays: OrUsageDay[]; days: OrUsageDay[]; mode: "vendor" | "country"; agg: "day" | "week" }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 400, h: 200 });
  const [hover, setHover] = useState<number | null>(null); // hover 数据点索引
  const [hoverLayer, setHoverLayer] = useState<string | null>(null); // hover 面积层名
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      if (r.width > 60 && r.height > 60) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const chart = useMemo(() => {
    if (!days || days.length < 2) return null;
    const { w: W, h: H } = size;
    if (!W || !H || W < 100 || H < 50) return null;
    const ch = H - 36, PL = 50, PR = 18, PT = 8, PB = 34;
    const iw = W - PL - PR, ih = ch - PT - PB;
    if (iw < 40 || ih < 20) return null;
    const n = days.length;

    // decide which data source to use
    const source = mode === "country" ? "countries" : "providers";

    // get top names from allDays
    const cum: Record<string, number> = {};
    for (const d of allDays)
      for (const p of d[source]) cum[p.name] = (cum[p.name] || 0) + p.tokens;
    let topNames = Object.keys(cum).filter((v) => v !== "其他").sort((a, b) => cum[b] - cum[a]);
    // 将 openrouter 合并到"其他"
    topNames = topNames.filter((v) => v !== "openrouter");

    // vendor 模式取 top N, country 模式保留全部国家; 其余并入"其他"
    const keep = mode === "vendor" ? topNames.slice(0, TOP_N) : topNames;
    const keepSet = new Set(keep);
    const stacked = days.map((d) => {
      const m: Record<string, number> = {};
      let other = 0;
      for (const p of d[source])
        if (keepSet.has(p.name)) m[p.name] = p.tokens;
        else other += p.tokens;
      return { date: d.date, total: d.total, m, other };
    });

    const allVals = stacked.flatMap((s) => [s.total, ...Object.values(s.m), s.other]);
    let lo = Math.min(...allVals) * 0.92, hi = Math.max(...allVals) * 1.08;
    if (hi - lo < 1) { hi = lo + 1 || 1; lo = 0; }
    const X = (i: number) => PL + (i / Math.max(n - 1, 1)) * iw;
    const Y = (v: number) => PT + ih - ((v - lo) / (hi - lo)) * ih;
    const ord = [...keep, "其他"];

    const areas = ord.map((v) => {
      const top: { x: number; y: number }[] = [], bot: { x: number; y: number }[] = [];
      for (let i = 0; i < n; i++) {
        const s = stacked[i];
        let b = 0;
        for (const o of ord) { if (o === v) break; b += o === "其他" ? s.other : (s.m[o] || 0); }
        const val = v === "其他" ? s.other : (s.m[v] || 0);
        top.push({ x: X(i), y: Y(b + val) });
        bot.push({ x: X(i), y: Y(b) });
      }
      return { name: v, d: smoothPath(top) + smoothPath([...bot].reverse()).replace(/^M/, "L") + "Z" };
    });

    const yTicks: { v: number; y: number }[] = [];
    for (let i = 0; i <= 4; i++) yTicks.push({ v: lo + ((hi - lo) / 4) * i, y: Y(lo + ((hi - lo) / 4) * i) });
    const xStep = Math.max(1, Math.floor(n / 8));
    const xLabels: { label: string; x: number }[] = [];
    const span = n > 1 ? (new Date(days[n-1].date).getTime() - new Date(days[0].date).getTime()) / 86400000 : 0;
    const fmt = span > 200 ? (d: string) => d.slice(0, 7) : (d: string) => d.slice(5);
    for (let i = 0; i < n; i += xStep) xLabels.push({ label: fmt(days[i].date), x: X(i) });
    const lastX = X(n - 1);
    if (!xLabels.length || xLabels[xLabels.length - 1].x < lastX - 20) xLabels.push({ label: fmt(days[n - 1].date), x: lastX });
    const last = stacked[n - 1].total, first = stacked[0].total, chg = last - first;
    const chgPct = first ? ((last / first) - 1) * 100 : 0;
    const dayCount = n - 1;
    const dailyRate = dayCount > 0 && first ? ((last / first) ** (1 / dayCount) - 1) * 100 : 0;
    const avg7 = stacked.slice(-7).reduce((s, d) => s + d.total, 0) / Math.min(7, n);
    const avg = stacked.reduce((s, d) => s + d.total, 0) / n;
    return { W, H, PL, PR, PT, PB, areas, yTicks, xLabels, last, chg, chgPct, dailyRate, avg7, avg, dayCount, stacked, ord, X, Y };
  }, [days, allDays, size, mode]);

  if (!chart) return <div className="flex h-full items-center justify-center text-[11px] text-slate-600">暂无数据</div>;

  return (
    <div ref={boxRef} className="relative flex h-full min-h-0 w-full flex-col">
      <div className="flex shrink-0 flex-wrap gap-x-3 gap-y-0.5 pb-1 text-[9px]">
        {chart.areas.map((a) => (
          <span key={a.name} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: vendorColor(a.name) }} />
            {a.name}
          </span>
        ))}
      </div>
      <div className="flex shrink-0 items-baseline gap-3 pb-1 text-[10px]">
        <span className="font-semibold text-slate-200">{fmtT(chart.last)}</span>
        <span className={chart.chg >= 0 ? "text-emerald-400" : "text-red-400"}>
          {chart.chg >= 0 ? "↑" : "↓"} {chart.chgPct > 0.01 || chart.chgPct < -0.01 ? `${chart.chgPct > 0 ? "+" : ""}${chart.chgPct.toFixed(1)}%` : "0%"}
        </span>
        <span className="text-slate-500">{agg === "week" ? "周均" : "日均"} {fmtT(Math.round(chart.avg))}</span>
        <span className="text-slate-500">{agg === "week" ? "周增速" : "日增速"} {chart.dailyRate > 0.001 ? `+${chart.dailyRate.toFixed(2)}%` : `${chart.dailyRate.toFixed(2)}%`}</span>
        <span className="text-slate-500">近{agg === "week" ? "4周" : "7日"} {fmtT(Math.round(chart.avg7))}/{agg === "week" ? "周" : "日"}</span>
      </div>
      <svg
        ref={svgRef}
        width={chart.W}
        height={chart.H - 36}
        className="block flex-1"
        style={{ overflow: "visible" }}
        onMouseLeave={() => { setHover(null); setHoverLayer(null); }}
        onMouseMove={(e) => {
          const rect = svgRef.current?.getBoundingClientRect();
          if (!rect) return;
          const mx = e.clientX - rect.left;
          const n = chart.stacked.length;
          const i = Math.round(((mx - chart.PL) / (chart.W - chart.PL - chart.PR)) * (n - 1));
          setHover(i >= 0 && i < n ? i : null);
        }}
      >
        {/* 网格 + 十字准线(优先于网格线) */}
        {chart.yTicks.map((t, i) => (
          <line key={i} x1={chart.PL} y1={t.y} x2={chart.W - chart.PR} y2={t.y} stroke="#1e293b" strokeWidth={0.5} />
        ))}
        {hover != null && (
          <line x1={chart.X(hover)} y1={8} x2={chart.X(hover)} y2={chart.H - 36 - 4} stroke="rgba(148,163,184,0.6)" strokeWidth={0.8} strokeDasharray="3 3" />
        )}
        {/* 面积层: hover 时高亮目标层, 其他层降透明 */}
        {chart.areas.map((a) => (
          <path
            key={a.name}
            d={a.d}
            fill={vendorColor(a.name)}
            opacity={hoverLayer == null || hoverLayer === a.name ? 1 : 0.25}
            style={{ transition: "opacity 0.15s", cursor: hoverLayer === a.name ? "pointer" : "default" }}
            onMouseEnter={() => setHoverLayer(a.name)}
            onMouseLeave={() => setHoverLayer(null)}
          />
        ))}
        {chart.xLabels.map((xl, i) => (
          <Fragment key={i}>
            <line x1={xl.x} y1={8} x2={xl.x} y2={chart.H - 36 - 4} stroke="rgba(148,163,184,0.15)" strokeWidth={0.5} />
            <text x={xl.x} y={chart.H - 52} textAnchor="middle" fill="#94a3b8" fontSize={9} fontFamily="monospace">{xl.label}</text>
          </Fragment>
        ))}
        {chart.yTicks.map((t, i) => (
          <text key={`y${i}`} x={chart.PL - 4} y={t.y + 3} textAnchor="end" fill="#64748b" fontSize={8} fontFamily="monospace">{fmtT(Math.round(t.v))}</text>
        ))}
        {/* 数据点标记: hover 当天 */}
        {hover != null && (
          <circle cx={chart.X(hover)} cy={chart.Y(chart.stacked[hover].total)} r={2.5} fill="#a78bfa" />
        )}
      </svg>
      {/* tooltip: 十字准线对应的当日明细 */}
      {hover != null && chart.stacked[hover] && (
        <div
          className="pointer-events-none absolute z-10 min-w-[150px] rounded border border-slate-700/60 bg-[#0a1220]/95 p-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.5)]"
          style={{
            left: Math.min(Math.max(chart.X(hover) - 75, 4), chart.W - 160),
            top: 4,
          }}
        >
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[10px]">
            <span className="font-semibold text-slate-200">{chart.stacked[hover].date}</span>
            <span className="font-mono text-slate-400">{fmtT(chart.stacked[hover].total)}</span>
          </div>
          <div className="max-h-[130px] space-y-px overflow-y-auto">
            {chart.ord.map((v) => {
              const s = chart.stacked[hover];
              const val = v === "其他" ? s.other : (s.m[v] || 0);
              if (val <= 0) return null;
              const pct = s.total > 0 ? (val / s.total) * 100 : 0;
              return (
                <div key={v} className="flex items-center gap-1.5 text-[9px] leading-3">
                  <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: vendorColor(v) }} />
                  <span className="w-14 shrink-0 truncate text-slate-400">{v}</span>
                  <span className="ml-auto font-mono text-slate-200">{fmtT(val)}</span>
                  <span className="w-9 text-right font-mono text-slate-500">{pct.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** 按 7 天桶聚合为周数据(日期取桶内最后一天, 厂商/国家按名合并 token) */
function aggregateWeekly(days: OrUsageDay[]): OrUsageDay[] {
  const out: OrUsageDay[] = [];
  let bucket: OrUsageDay | null = null;
  let weekStart = 0;
  for (const d of days) {
    const t = Date.parse(`${d.date}T00:00:00Z`);
    if (!bucket || t - weekStart >= 7 * 86400000) {
      if (bucket) out.push(bucket);
      weekStart = t;
      bucket = { date: d.date, total: 0, providers: [], countries: [] };
    }
    bucket.date = d.date; // 桶标签取最后一天
    bucket.total += d.total;
    for (const key of ["providers", "countries"] as const) {
      const target = bucket[key];
      for (const p of d[key]) {
        const ex = target.find((x) => x.name === p.name);
        if (ex) { ex.tokens += p.tokens; ex.pct = p.pct; }
        else target.push({ date: d.date, name: p.name, tokens: p.tokens, pct: p.pct });
      }
    }
  }
  if (bucket) out.push(bucket);
  return out;
}

export function OpenRouterPanel({ className, panelId, isZoomed, onToggleZoom }: PanelZoomProps & { className?: string }) {
  const [range, setRange] = useState<"7d" | "14d" | "30d" | "60d" | "180d" | "1y">("30d");
  const [mode, setMode] = useState<"vendor" | "country">("vendor");
  const [agg, setAgg] = useState<"day" | "week">("day");
  const { data, loading, error } = useOpenRouterUsage();

  const sliced = useMemo(() => {
    if (!data || data.length === 0) return [];
    const n = range === "7d" ? 7 : range === "14d" ? 14 : range === "30d" ? 30 : range === "60d" ? 60 : range === "180d" ? 180 : 365;
    const days = data.slice(-n);
    return agg === "week" ? aggregateWeekly(days) : days;
  }, [data, range, agg]);

  return (
    <Panel
      title="公有云 Token 消耗"
      icon={<Cpu size={14} />}
      accent="#a78bfa"
      className={className}
      panelId={panelId}
      isZoomed={isZoomed}
      onToggleZoom={onToggleZoom}
      right={
        <div className="flex gap-1">
          <div className="mr-1 flex gap-0.5 rounded border border-slate-700/60 p-0.5 text-[10px]">
            <button onClick={() => setAgg("day")} className={`rounded px-1.5 py-0.5 transition-colors ${agg === "day" ? "bg-violet-500/20 text-violet-300" : "text-slate-500 hover:text-slate-300"}`}>日</button>
            <button onClick={() => { setAgg("week"); if (range === "7d" || range === "14d") setRange("30d"); }} className={`rounded px-1.5 py-0.5 transition-colors ${agg === "week" ? "bg-violet-500/20 text-violet-300" : "text-slate-500 hover:text-slate-300"}`}>周</button>
          </div>
          <div className="mr-1 flex gap-0.5 rounded border border-slate-700/60 p-0.5 text-[10px]">
            <button onClick={() => setMode("vendor")} className={`rounded px-1.5 py-0.5 transition-colors ${mode === "vendor" ? "bg-violet-500/20 text-violet-300" : "text-slate-500 hover:text-slate-300"}`}>厂商</button>
            <button onClick={() => setMode("country")} className={`rounded px-1.5 py-0.5 transition-colors ${mode === "country" ? "bg-violet-500/20 text-violet-300" : "text-slate-500 hover:text-slate-300"}`}>中美</button>
          </div>
          {(["7d", "14d", "30d", "60d", "180d", "1y"] as const).map((r) => {
            const off = agg === "week" && (r === "7d" || r === "14d");
            return (
              <button key={r} disabled={off} onClick={() => setRange(r)} className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${range === r ? "bg-violet-500/20 text-violet-300" : off ? "cursor-not-allowed text-slate-700" : "text-slate-500 hover:text-slate-300"}`}>{r}</button>
            );
          })}
        </div>
      }
    >
      <div className="flex h-full flex-col p-2 pt-1">
        {loading ? (
          <div className="flex h-full items-center justify-center text-[11px] text-slate-600">加载中…</div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-[11px] text-red-400">数据异常: {error}</div>
        ) : (
          <div className="min-h-0 flex-1">
            <Chart allDays={data || []} days={sliced} mode={mode} agg={agg} />
          </div>
        )}
        <div className="flex items-center justify-between pt-1 text-[9px] text-slate-600">
          <span>数据: OpenRouter Rankings API</span>
          <span>日更新</span>
        </div>
      </div>
    </Panel>
  );
}
