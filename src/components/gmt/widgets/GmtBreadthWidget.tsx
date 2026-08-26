import { useMemo } from "react";
import { fmtPct } from "@/lib/format";
import { useGmtDemo } from "../gmt-context";

/** 02 — 市场宽度（点击联动热力图涨跌筛选） */
export function GmtBreadthWidget() {
  const { flatStocks, movers, setMovers } = useGmtDemo();

  const stats = useMemo(() => {
    const n = flatStocks.length || 1;
    const up = flatStocks.filter((s) => s.pct > 0).length;
    const down = flatStocks.filter((s) => s.pct < 0).length;
    const flat = flatStocks.filter((s) => s.pct === 0).length;
    const avg = flatStocks.reduce((a, s) => a + s.pct, 0) / n;
    const strongUp = flatStocks.filter((s) => s.pct >= 3).length;
    const strongDn = flatStocks.filter((s) => s.pct <= -3).length;
    const upPct = (up / n) * 100;
    return { up, down, flat, avg, strongUp, strongDn, upPct, n: flatStocks.length };
  }, [flatStocks]);

  const cells = [
    { key: "up", label: "上涨", sub: `${stats.up} 只`, val: fmtPct((stats.up / Math.max(stats.n, 1)) * 100), cls: "gmt-up", filter: "UP" as const },
    { key: "down", label: "下跌", sub: `${stats.down} 只`, val: fmtPct((stats.down / Math.max(stats.n, 1)) * 100), cls: "gmt-down", filter: "DOWN" as const },
    { key: "flat", label: "平盘", sub: `${stats.flat} 只`, val: "—", cls: "gmt-flat", filter: "ALL" as const },
    { key: "avg", label: "均涨跌", sub: "样本内", val: fmtPct(stats.avg), cls: stats.avg > 0 ? "gmt-up" : stats.avg < 0 ? "gmt-down" : "gmt-flat", filter: null },
    { key: "su", label: "强涨 ≥3%", sub: "极端", val: String(stats.strongUp), cls: "gmt-up", filter: "UP" as const },
    { key: "sd", label: "强跌 ≤-3%", sub: "极端", val: String(stats.strongDn), cls: "gmt-down", filter: "DOWN" as const },
  ];

  return (
    <>
      <div className="gmt-bd-grid">
        {cells.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`gmt-bd-cell${c.filter && movers === c.filter ? " on" : ""}`}
            style={c.filter && movers === c.filter ? { outline: "1px solid var(--gmt-amber)" } : undefined}
            onClick={() => c.filter && setMovers(c.filter)}
          >
            <div className="bl">{c.label}</div>
            <div className={`bv ${c.cls}`}>{c.val}</div>
            <div className="bs">{c.sub}</div>
          </button>
        ))}
      </div>
      <div className="gmt-bd-note">
        样本 {stats.n} 只 · 上涨占比 {stats.upPct.toFixed(0)}% · 点击单元格筛选 01 热力图
      </div>
    </>
  );
}
