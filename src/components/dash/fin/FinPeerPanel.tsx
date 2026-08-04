import { useEffect, useMemo, useRef, useState } from "react";
import { GitCompare } from "lucide-react";
import { Panel, type PanelZoomProps } from "../Panel";
import { useFin } from "./FinContext";
import { useFinBoard, useFinMain } from "./useFinData";
import { SkeletonRows } from "./SkeletonRows";
import { TNUM, fmtYi } from "./utils";

type Mode = "table" | "radar";

/** 数值比较条: 公司值 vs 行业均值, 相对宽度指示 */
function CmpBar({ val, avg }: { val: number; avg: number }) {
  const max = Math.max(val, avg, 1);
  const vw = Math.max((val / max) * 100, 2);
  const aw = Math.max((avg / max) * 100, 2);
  const vCls = val >= avg ? "bg-rose-400/70" : "bg-emerald-400/70";
  return (
    <div className="flex h-[3px] w-full gap-[1px]">
      <div className={vCls} style={{ width: `${vw}%`, transition: "width 0.3s" }} />
      <div className="h-full flex-1 rounded-r bg-slate-600/40" style={{ width: `${aw}%` }}>
        <div className="h-full w-full rounded-r bg-amber-400/20" />
      </div>
    </div>
  );
}

const pctCls = (v: number) => (v > 0 ? "text-rose-400" : v < 0 ? "text-emerald-400" : "text-slate-400");

/** 同行对比: 表格(公司指标 vs 行业均值/排名) + 雷达图 */
export function FinPeerPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const [mode, setMode] = useState<Mode>("radar");
  const { company, period } = useFin();

  const { data: board, error: boardErr, loading: boardLoading, retry: retryBoard } = useFinBoard(period);
  const { data: finData, error: finErr, loading: finLoading, retry: retryMain } = useFinMain(company.code);

  const loading = boardLoading || finLoading;
  const error = boardErr || finErr;
  const retry = () => { retryBoard(); retryMain(); };

  // 在 board 中匹配公司（尝试多种代码格式 + 名称匹配）
  const peerData = useMemo(() => {
    if (!board?.stocks?.length || !finData?.reports?.[0]) return null;
    const bare = company.code.replace(/^(sh|sz|bj)/, "");
    let companyInBoard = board.stocks.find(
      (s) => s.code === bare || s.code === company.code || s.code === `${bare}.${company.code.startsWith("sh") ? "SH" : company.code.startsWith("sz") ? "SZ" : "BJ"}`
    );
    // 代码匹配失败时尝试名称匹配
    if (!companyInBoard) {
      companyInBoard = board.stocks.find((s) => s.name === company.name || s.name === finData.name);
    }
    // 仍未匹配: 用 finance-main 返回的行业名查找 peer 列表
    const finIndustry = finData.industry || "";

    if (!companyInBoard && !finIndustry) return { industry: null, comparisons: null, count: 0 };

    const industry = companyInBoard?.industry || finIndustry;
    const peers = board.stocks.filter((s) => s.industry === industry);
    const count = peers.length;
    const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const rank = (arr: number[], val: number) => arr.filter((v) => v > val).length + 1;

    const peerNp = peers.map((s) => s.netProfit);
    const peerRoe = peers.map((s) => s.roe);
    const peerEps = peers.map((s) => s.eps);
    const peerPy = peers.map((s) => s.profitYoY);
    const peerRy = peers.map((s) => s.revenueYoY);

    const r0 = finData.reports[0];
    // 公司在榜内则取榜内数值(用于排名), 否则用 finance-main 的值(仅对比不排名)
    const cmpNp = companyInBoard ? companyInBoard.netProfit : r0.netProfit;
    const cmpRoe = companyInBoard ? companyInBoard.roe : r0.roe;
    const cmpEps = companyInBoard ? companyInBoard.eps : r0.eps;
    const cmpPy = companyInBoard ? companyInBoard.profitYoY : r0.profitYoY;
    const cmpRy = companyInBoard ? companyInBoard.revenueYoY : r0.revenueYoY;

    const rankStr = (arr: number[], val: number) =>
      companyInBoard ? `${rank(arr, val)}/${count}` : "—";

    const comparisons = [
      {
        label: "净利",
        companyVal: fmtYi(r0.netProfit),
        peerVal: count > 0 ? fmtYi(avg(peerNp)) : "—",
        rank: rankStr(peerNp, cmpNp),
        barVal: cmpNp,
        barAvg: avg(peerNp),
      },
      {
        label: "净利增速",
        companyVal: `${cmpPy > 0 ? "+" : ""}${cmpPy.toFixed(1)}%`,
        peerVal: count > 0 ? `${avg(peerPy) > 0 ? "+" : ""}${avg(peerPy).toFixed(1)}%` : "—",
        rank: rankStr(peerPy, cmpPy),
        barVal: cmpPy,
        barAvg: avg(peerPy),
        colorCls: pctCls(cmpPy),
      },
      {
        label: "营收增速",
        companyVal: `${cmpRy > 0 ? "+" : ""}${cmpRy.toFixed(1)}%`,
        peerVal: count > 0 ? `${avg(peerRy) > 0 ? "+" : ""}${avg(peerRy).toFixed(1)}%` : "—",
        rank: rankStr(peerRy, cmpRy),
        barVal: cmpRy,
        barAvg: avg(peerRy),
        colorCls: pctCls(cmpRy),
      },
      {
        label: "ROE",
        companyVal: `${cmpRoe.toFixed(1)}%`,
        peerVal: count > 0 ? `${avg(peerRoe).toFixed(1)}%` : "—",
        rank: rankStr(peerRoe, cmpRoe),
        barVal: cmpRoe,
        barAvg: avg(peerRoe),
      },
      {
        label: "EPS",
        companyVal: cmpEps.toFixed(2),
        peerVal: count > 0 ? avg(peerEps).toFixed(2) : "—",
        rank: rankStr(peerEps, cmpEps),
        barVal: cmpEps,
        barAvg: avg(peerEps),
      },
    ];

    return { industry, comparisons, count, inBoard: !!companyInBoard };
  }, [board, finData, company.code, company.name]);

  // 雷达图数据: 归一化到 0-1, 公司 vs 行业均值
  const radarData = useMemo(() => {
    if (!peerData?.comparisons) return null;
    const axes = peerData.comparisons.map((c) => {
      const max = Math.max(Math.abs(c.barVal), Math.abs(c.barAvg), 1);
      return {
        label: c.label,
        company: Math.max(c.barVal / max, 0.02),
        peer: Math.max(c.barAvg / max, 0.02),
      };
    });
    return axes;
  }, [peerData]);

  const hasPeer = peerData && peerData.industry;

  return (
    <Panel
      className={className}
      {...zoomProps}
      title="同业对比"
      icon={<GitCompare size={14} />}
      accent="#a78bfa"
      right={
        <div className="flex items-center gap-2 text-[10px]">
          {(["radar", "table"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex h-[22px] items-center rounded px-2 ${
                mode === m ? "bg-violet-500/20 text-violet-300" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {m === "radar" ? "雷达" : "表格"}
            </button>
          ))}
        </div>
      }
    >
      {!company.code ? (
        <div className="flex h-full items-center justify-center text-[11px] text-slate-600">
          ← 从榜单选入公司
        </div>
      ) : !board || !finData ? (
        loading ? (
          <SkeletonRows rows={8} />
        ) : (
          <div className="flex h-full items-center justify-center text-[11px]">
            <button className="h-full w-full text-slate-500" onClick={retry}>
              数据获取失败，点击重试{error ? `(${error})` : ""}
            </button>
          </div>
        )
      ) : !hasPeer ? (
        <div className="flex h-full flex-col items-center justify-center gap-1 text-[11px] text-slate-600">
          <span>未找到该公司行业信息</span>
          <span className="text-[9px] text-slate-700">该股票可能不在当期统计范围内</span>
        </div>
      ) : mode === "table" ? (
        <div className="flex h-full min-h-0 flex-col">
          {/* 行业头部 */}
          <div className="flex shrink-0 items-center gap-2 border-b border-slate-800/60 px-2 py-1">
            <span className="text-[11px] font-semibold text-violet-300">{peerData.industry}</span>
            <span className="text-[9px] text-slate-500">
              共 {peerData.count} 家
              {peerData.inBoard && peerData.count > 0 ? " · 排名第" : ""}
            </span>
            {!peerData.inBoard && (
              <span className="text-[8px] text-amber-400/70">(未入榜,仅对比均值)</span>
            )}
          </div>
          {/* 表头 */}
          <div className="flex shrink-0 items-center gap-2 border-b border-slate-800/40 px-2 py-0.5 text-[8.5px] text-slate-500">
            <span className="w-[48px] shrink-0">指标</span>
            <span className="min-w-0 flex-1 text-right">{finData.name.length > 6 ? finData.name.slice(0, 6) : finData.name}</span>
            <span className="w-[52px] shrink-0 text-right">行业均值</span>
            <span className="w-[36px] shrink-0 text-right">排名</span>
          </div>
          {/* 行 */}
          <div className="min-h-0 flex-1 overflow-y-auto py-0.5">
            {peerData.comparisons!.map((c, i) => (
              <div key={c.label} className="flex flex-col border-b border-slate-800/30 px-2 py-1 hover:bg-slate-800/20">
                <div className="flex items-center gap-2">
                  <span className="w-[48px] shrink-0 text-[10px] text-slate-400">{c.label}</span>
                  <span className={`min-w-0 flex-1 text-right text-[11px] font-semibold ${c.colorCls ?? "text-slate-200"}`} style={TNUM}>
                    {c.companyVal}
                  </span>
                  <span className="w-[52px] shrink-0 text-right text-[10px] text-slate-500" style={TNUM}>
                    {c.peerVal}
                  </span>
                  <span className="w-[36px] shrink-0 text-right text-[9px] text-slate-400" style={TNUM}>
                    {c.rank}
                  </span>
                </div>
                {/* 比较底条 */}
                {i < peerData.comparisons!.length - 1 && (
                  <div className="mt-0.5 px-0">
                    <CmpBar val={Math.abs(c.barVal)} avg={Math.abs(c.barAvg)} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : radarData ? (
        <RadarChart axes={radarData} companyName={finData.name} />
      ) : null}
    </Panel>
  );
}

/** 雷达图: SVG 多边形 + 轴标签, 自适应面板大小 */
function RadarChart({ axes, companyName }: { axes: { label: string; company: number; peer: number }[]; companyName: string }) {
  const n = axes.length;
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 300, h: 260 });

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

  if (n < 3) return <div className="flex h-full items-center justify-center text-[11px] text-slate-600">需要至少 3 项指标</div>;

  const { w: W, h: H } = size;
  const padding = 28;
  const legendH = 20;
  const plotH = H - legendH;
  const CX = W / 2;
  const CY = (plotH - padding) / 2 + padding * 0.6;
  const R = Math.min(CX - padding, CY - padding, (plotH - padding * 2) / 2);
  const levels = 5;
  const fontSize = Math.max(9, Math.min(12, R / 8));

  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, r: number) => ({
    x: CX + r * Math.cos(angle(i)),
    y: CY + r * Math.sin(angle(i)),
  });

  const grids = Array.from({ length: levels }, (_, li) => {
    const r = ((li + 1) / levels) * R;
    return axes.map((_, i) => pt(i, r));
  });

  const companyPts = axes.map((a, i) => pt(i, a.company * R));
  const peerPts = axes.map((a, i) => pt(i, a.peer * R));
  const labelR = R + Math.max(14, fontSize * 1.6);

  return (
    <div ref={boxRef} className="flex h-full min-h-0 flex-col items-center justify-center">
      <svg width={W} height={plotH} className="block">
        {grids.map((ring, li) => (
          <polygon
            key={li}
            points={ring.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
            fill="none"
            stroke="#1e293b"
            strokeWidth={1}
          />
        ))}
        {axes.map((_, i) => {
          const outer = pt(i, R);
          return <line key={i} x1={CX} y1={CY} x2={outer.x} y2={outer.y} stroke="#1e293b" strokeWidth={1} />;
        })}
        <polygon
          points={peerPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
          fill="#fbbf24"
          fillOpacity={0.08}
          stroke="#fbbf24"
          strokeWidth={1}
          strokeDasharray="3 2"
        />
        <polygon
          points={companyPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
          fill="#a78bfa"
          fillOpacity={0.15}
          stroke="#a78bfa"
          strokeWidth={1.5}
        />
        {axes.map((a, i) => {
          const outer = pt(i, labelR);
          return (
            <text
              key={i}
              x={outer.x}
              y={outer.y + fontSize * 0.35}
              fontSize={fontSize}
              fill="#94a3b8"
              textAnchor="middle"
              style={TNUM}
            >
              {a.label}
            </text>
          );
        })}
      </svg>
      <div className="flex shrink-0 items-center gap-4 text-[10px]" style={{ height: legendH }}>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-violet-400/40" />
          <span className="text-slate-400">
            {companyName.length > 6 ? companyName.slice(0, 6) : companyName}
          </span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm border border-amber-400/50 bg-amber-400/10" />
          <span className="text-slate-500">行业均值</span>
        </span>
      </div>
    </div>
  );
}
