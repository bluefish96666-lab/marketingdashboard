import { useEffect, useMemo } from "react";
import { usePolling } from "@/hooks/usePolling";
import { api, type MinuteData } from "@/lib/api";
import { normalizeStockCode } from "@/lib/code";
import { POLL } from "@/lib/intervals";
import { fmtPct } from "@/lib/format";
import { useElementSize } from "@/hooks/useElementSize";
import { useGmtDemo } from "../gmt-context";

const COLORS = ["#4DD0E1", "#F28C00", "#D7D7D7", "#A78BFA", "#F472B6", "#34D399"];
const TOP_N = 3;

function toMin(t: string): number {
  const s = t.includes(":") ? (t.trim().split(/\s+/).pop() ?? t) : t;
  if (s.includes(":")) {
    const [h, m] = s.split(":");
    return +h * 60 + +m;
  }
  return +s.slice(0, 2) * 60 + +s.slice(2, 4);
}
/** A 股交易分钟 → 0..1 */
function xOf(t: string): number {
  const mm = toMin(t);
  let e = mm - 570;
  if (mm >= 780) e -= 90;
  return Math.max(0, Math.min(e, 240)) / 240;
}

/** 05 — 板块日内走势：产业链分组等权日内曲线（每组取市值前 3 只等权）+ 各组涨跌横条 */
export function GmtSectorWidget() {
  const { groups, sector, setSector, reportSource, openInspect } = useGmtDemo();
  const { ref, size } = useElementSize(40);

  const picks = useMemo(
    () =>
      groups.map((g) => ({
        g,
        codes: g.stocks.slice().sort((a, b) => b.circMv - a.circMv).slice(0, TOP_N).map((s) => normalizeStockCode(s.code)),
      })),
    [groups]
  );
  const allCodes = useMemo(() => [...new Set(picks.flatMap((p) => p.codes))], [picks]);

  const { data: minutes, error } = usePolling(
    () => (allCodes.length ? api.batchMinute(allCodes) : Promise.resolve({} as Record<string, MinuteData | null>)),
    POLL.SECTOR,
    [allCodes.join(",")]
  );

  useEffect(() => {
    if (minutes || error) reportSource("sector", "板块等权分时 · /api/batch-minute", !error, minutes ? Object.values(minutes).filter(Boolean).length : 0);
  }, [minutes, error, reportSource]);

  // 每组等权：按时间点对齐，取各成分 (p/prec-1) 的均值
  const lines = useMemo(() => {
    if (!minutes) return [];
    return picks.map(({ g, codes }, gi) => {
      const series = codes.map((c) => minutes[c]).filter((m): m is MinuteData => !!m && m.points.length > 1 && m.prec > 0);
      if (!series.length) return { g, color: COLORS[gi % COLORS.length], pts: [] as { x: number; y: number }[], last: 0 };
      const byT = new Map<string, number[]>();
      for (const m of series) for (const p of m.points) {
        const arr = byT.get(p.t) ?? [];
        arr.push((p.p / m.prec - 1) * 100);
        byT.set(p.t, arr);
      }
      const pts = [...byT.entries()]
        .filter(([, v]) => v.length === series.length)
        .map(([t, v]) => ({ x: xOf(t), y: v.reduce((a, b) => a + b, 0) / v.length }))
        .sort((a, b) => a.x - b.x);
      return { g, color: COLORS[gi % COLORS.length], pts, last: pts.length ? pts[pts.length - 1].y : 0 };
    });
  }, [minutes, picks]);

  const W = Math.max(size.w, 100);
  const H = Math.max(size.h, 60);
  const ys = lines.flatMap((l) => l.pts.map((p) => p.y));
  let lo = Math.min(0, ...ys);
  let hi = Math.max(0, ...ys);
  if (hi - lo < 0.2) {
    hi += 0.1;
    lo -= 0.1;
  }
  const pad = (hi - lo) * 0.1;
  lo -= pad;
  hi += pad;
  const Y = (v: number) => H - 4 - ((v - lo) / (hi - lo)) * (H - 8);
  const X = (x: number) => 4 + x * (W - 44);
  const maxAbs = Math.max(0.01, ...groups.map((g) => Math.abs(g.avgPct)));

  return (
    <>
      <div className="gmt-sector-legend">
        {lines.map((l) => (
          <span key={l.g.id} style={{ color: l.color }}>
            ● {l.g.name} <span className={l.last >= 0 ? "gmt-up" : "gmt-down"}>{fmtPct(l.last)}</span>
          </span>
        ))}
        {!lines.length && <span>加载分时…</span>}
      </div>
      <div ref={ref} className="gmt-sector-chart">
        {size.w > 0 && (
          <svg width={W} height={H} style={{ display: "block" }}>
            <line x1={X(0)} x2={X(1)} y1={Y(0)} y2={Y(0)} stroke="#3a3a3a" strokeDasharray="2,3" />
            <text x={X(1) + 3} y={Y(0) + 3} fill="#5a5a5a" fontSize={8}>0.0%</text>
            <text x={X(0)} y={H - 1} fill="#5a5a5a" fontSize={8}>OPEN</text>
            <text x={X(1) - 20} y={H - 1} fill="#5a5a5a" fontSize={8}>LAST</text>
            {lines.map((l) =>
              l.pts.length > 1 ? (
                <polyline key={l.g.id} fill="none" stroke={l.color} strokeWidth={1.2} points={l.pts.map((p) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ")} />
              ) : null
            )}
            {lines.map((l) =>
              l.pts.length ? (
                <text key={`t-${l.g.id}`} x={X(1) + 3} y={Y(l.last) + 3} fill={l.color} fontSize={8}>
                  {l.last > 0 ? "+" : ""}{l.last.toFixed(1)}%
                </text>
              ) : null
            )}
          </svg>
        )}
      </div>
      <div className="gmt-sector-bars">
        {groups.map((g, gi) => {
          const w = Math.min(100, (Math.abs(g.avgPct) / maxAbs) * 100);
          const active = sector === g.id;
          return (
            <button
              key={g.id}
              type="button"
              className={`gmt-sector-bar${active ? " on" : ""}`}
              onClick={() => {
                setSector(active ? "ALL" : g.id);
                openInspect({
                  type: "market",
                  label: `${g.name} · 等权涨跌`,
                  pct: g.avgPct,
                  rows: [["口径", "成分股日涨跌幅算术平均"], ["成分", `${g.stocks.length} 只`], ["日内曲线", `市值前 ${TOP_N} 只等权 (p/昨收-1)`], ["来源", "腾讯行情 /api/quotes · /api/batch-minute"]],
                });
              }}
            >
              <span className="sb-name" style={{ color: COLORS[gi % COLORS.length] }}>{g.name}</span>
              <span className="sb-track">
                <span className="sb-fill" style={{ width: `${w}%`, background: g.avgPct >= 0 ? "var(--gmt-up)" : "var(--gmt-down)" }} />
              </span>
              <span className={`sb-val ${g.avgPct >= 0 ? "gmt-up" : "gmt-down"}`}>{fmtPct(g.avgPct)}</span>
              <span className="sb-n">n={g.stocks.length}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
