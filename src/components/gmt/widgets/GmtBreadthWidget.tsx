import { useMemo } from "react";
import { fmtPct } from "@/lib/format";
import { tileLabel } from "@/components/dash/heatmap/heatmap-shared";
import { useGmtDemo } from "../gmt-context";

/** 02 — 市场宽度（K3 3×3：上涨/下跌/平盘 · 涨跌比/领涨/领跌 · 样本组/样本数/中位数） */
export function GmtBreadthWidget() {
  const { flatStocks, groups, sector, movers, setMovers, selectStock, openInspect } = useGmtDemo();

  const sample = useMemo(() => {
    if (sector === "ALL") return flatStocks;
    return groups.find((g) => g.id === sector)?.stocks ?? flatStocks;
  }, [flatStocks, groups, sector]);

  const st = useMemo(() => {
    const up = sample.filter((s) => s.pct > 0);
    const down = sample.filter((s) => s.pct < 0);
    const flat = sample.length - up.length - down.length;
    const ratio = down.length ? up.length / down.length : up.length ? Infinity : 0;
    const sorted = sample.slice().sort((a, b) => a.pct - b.pct);
    const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2].pct : (sorted[sorted.length / 2 - 1].pct + sorted[sorted.length / 2].pct) / 2) : 0;
    const lead = sorted[sorted.length - 1];
    const lag = sorted[0];
    return { up: up.length, down: down.length, flat, ratio, median, lead, lag };
  }, [sample]);

  const groupName = sector === "ALL" ? "全部产业链" : groups.find((g) => g.id === sector)?.name ?? "—";
  const cls = (v: number) => (v > 0 ? "gmt-up" : v < 0 ? "gmt-down" : "gmt-flat");
  const on = (m: typeof movers) => (movers === m ? { outline: "1px solid var(--gmt-amber)", outlineOffset: -1 } : undefined);

  return (
    <>
      <div className="gmt-bd-grid">
        <button type="button" className="gmt-bd-cell" style={on("UP")} onClick={() => setMovers((m) => (m === "UP" ? "ALL" : "UP"))}>
          <div className="bl">上涨</div>
          <div className="bv gmt-up">{st.up}</div>
          <div className="bs">只 · 点击筛选 01</div>
        </button>
        <button type="button" className="gmt-bd-cell" style={on("DOWN")} onClick={() => setMovers((m) => (m === "DOWN" ? "ALL" : "DOWN"))}>
          <div className="bl">下跌</div>
          <div className="bv gmt-down">{st.down}</div>
          <div className="bs">只 · 点击筛选 01</div>
        </button>
        <button type="button" className="gmt-bd-cell" onClick={() => setMovers("ALL")}>
          <div className="bl">平盘</div>
          <div className="bv gmt-flat">{st.flat}</div>
          <div className="bs">只</div>
        </button>
        <button type="button" className="gmt-bd-cell" onClick={() => openInspect({ type: "market", label: "涨跌比", rows: [["口径", "上涨只数 / 下跌只数"], ["样本", `${sample.length} 只`]] })}>
          <div className="bl">涨跌比</div>
          <div className={`bv ${st.ratio > 1 ? "gmt-up" : st.ratio < 1 ? "gmt-down" : "gmt-flat"}`}>{Number.isFinite(st.ratio) ? st.ratio.toFixed(2) : "∞"}</div>
          <div className="bs">上涨 / 下跌</div>
        </button>
        <button type="button" className="gmt-bd-cell" onClick={() => st.lead && selectStock(st.lead)}>
          <div className="bl">领涨</div>
          <div className={`bv ${st.lead ? cls(st.lead.pct) : ""}`}>{st.lead ? `${tileLabel(st.lead.code)} ${fmtPct(st.lead.pct)}` : "—"}</div>
          <div className="bs">{st.lead?.name ?? ""}</div>
        </button>
        <button type="button" className="gmt-bd-cell" onClick={() => st.lag && selectStock(st.lag)}>
          <div className="bl">领跌</div>
          <div className={`bv ${st.lag ? cls(st.lag.pct) : ""}`}>{st.lag ? `${tileLabel(st.lag.code)} ${fmtPct(st.lag.pct)}` : "—"}</div>
          <div className="bs">{st.lag?.name ?? ""}</div>
        </button>
        <div className="gmt-bd-cell" style={{ cursor: "default" }}>
          <div className="bl">样本组</div>
          <div className="bv" style={{ fontSize: 12 }}>{groupName}</div>
          <div className="bs">跟随 01 分组</div>
        </div>
        <div className="gmt-bd-cell" style={{ cursor: "default" }}>
          <div className="bl">样本数</div>
          <div className="bv">{sample.length} / {flatStocks.length}</div>
          <div className="bs">有效报价</div>
        </div>
        <div className="gmt-bd-cell" style={{ cursor: "default" }}>
          <div className="bl">涨跌幅中位数</div>
          <div className={`bv ${cls(st.median)}`}>{fmtPct(st.median)}</div>
          <div className="bs">样本内</div>
        </div>
      </div>
      <div className="gmt-bd-note">来源：01 热力矩阵同一份报价 · 实时计算 · 点击单元格查看口径</div>
    </>
  );
}
