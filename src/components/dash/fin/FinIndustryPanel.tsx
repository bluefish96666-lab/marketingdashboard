import { useEffect, useMemo, useRef, useState } from "react";
import { Panel, type PanelZoomProps } from "../Panel";
import { usePolling } from "@/hooks/usePolling";
import { api } from "@/lib/api";
import { TNUM, fmtYi } from "./utils";

const NAME_W = 64; // 行业名列宽
const LABEL_W = 92; // 条右端双值预留
const AXIS_H = 16; // 底部金额刻度

/** 行业盈利榜 TOP15: 条长∝净利合计(对数压缩), 条色按同比符号(负同比 40% 透明+虚线描边) */
export function FinIndustryPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const [retry, setRetry] = useState(0);
  const { data, error, loading } = usePolling(() => api.financeBoard(), 1800000, [retry]);
  const [hover, setHover] = useState(-1);

  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 400, h: 260 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => {
      const r = es[0].contentRect;
      if (r.width > 60 && r.height > 60) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]); // 容器仅在拿到数据后挂载, 数据到达时重新挂观察

  const chart = useMemo(() => {
    const list = (data?.industries ?? []).filter((d) => d.netProfit > 0).slice(0, 15);
    if (!list.length) return null;
    const { w: W, h: H } = size;
    const rowH = Math.min(16, (H - AXIS_H) / list.length);
    const barW = W - NAME_W - LABEL_W - 12;
    // 对数压缩防头部挤出
    const maxLog = Math.log10(Math.max(...list.map((d) => d.netProfit), 1));
    const X = (v: number) => NAME_W + (Math.log10(Math.max(v, 1)) / maxLog) * barW;
    // 底部 3 档金额刻度(自动取整百亿)
    const maxV = Math.max(...list.map((d) => d.netProfit));
    const step = Math.max(Math.ceil(maxV / 3 / 1e10) * 1e10, 1e10); // 1e10 = 百亿
    const ticks = [step, step * 2, step * 3].filter((v) => v <= maxV * 1.05);
    return { list, W, H, rowH, X, ticks };
  }, [data, size]);

  return (
    <Panel className={className} {...zoomProps} title="行业盈利榜" icon="▤" accent="#34d399">
      {!data ? (
        <div className="flex h-full items-center justify-center text-[11px]">
          {loading ? (
            <span className="text-slate-600">数据加载中…</span>
          ) : (
            <button className="h-full w-full text-slate-500" onClick={() => setRetry((r) => r + 1)}>
              数据获取失败，点击重试{error ? `(${error})` : ""}
            </button>
          )}
        </div>
      ) : !chart ? (
        <div className="flex h-full items-center justify-center text-[11px] text-slate-600">当前非财报密集披露期</div>
      ) : (
        <div ref={boxRef} className="h-full min-h-0">
          <svg width={chart.W} height={chart.H} className="block">
            {/* 底部金额刻度 + 网格线 */}
            {chart.ticks.map((v) => (
              <g key={v}>
                <line x1={chart.X(v)} y1={4} x2={chart.X(v)} y2={chart.H - AXIS_H} stroke="#1e293b" strokeWidth={1} />
                <text x={chart.X(v)} y={chart.H - 5} fontSize={8} fill="#475569" textAnchor="middle" style={TNUM}>
                  {(v / 1e8).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}亿
                </text>
              </g>
            ))}
            {chart.list.map((d, i) => {
              const y = i * chart.rowH;
              const up = d.yoy >= 0;
              const color = up ? "#fb7185" : "#34d399";
              const bw = Math.max(chart.X(d.netProfit) - NAME_W, 2);
              const bh = Math.min(9, chart.rowH - 5);
              return (
                <g key={d.name} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)}>
                  {hover === i && <rect x={0} y={y} width={chart.W} height={chart.rowH} fill="#1e293b" opacity={0.5} />}
                  <text x={4} y={y + chart.rowH / 2 + 3} fontSize={9} fill="#94a3b8">
                    {d.name.length > 6 ? d.name.slice(0, 6) : d.name}
                  </text>
                  <rect
                    x={NAME_W}
                    y={y + (chart.rowH - bh) / 2}
                    width={bw}
                    height={bh}
                    rx={1.5}
                    fill={color}
                    opacity={up ? 0.7 : 0.4}
                    stroke={up ? "none" : color}
                    strokeDasharray={up ? undefined : "2 2"}
                    strokeOpacity={up ? undefined : 0.8}
                  />
                  <text x={NAME_W + bw + 4} y={y + chart.rowH / 2 + 3} fontSize={8.5} style={TNUM}>
                    <tspan fill="#cbd5e1">{fmtYi(d.netProfit)} </tspan>
                    <tspan fill={color}>
                      {d.yoy > 0 ? "+" : ""}
                      {d.yoy.toFixed(1)}%
                    </tspan>
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </Panel>
  );
}
