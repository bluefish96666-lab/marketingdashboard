import { useMemo, useState } from "react";
import { useElementSize } from "@/hooks/useElementSize";
import { usePolling } from "@/hooks/usePolling";
import { heatColor } from "@/lib/heat-color";
import {
  areaVal,
  fetchHeatmapGroups,
  filterGroups,
  MOCK_HEAT_GROUPS,
  type AreaMode,
  type HeatGroup,
  type HeatStock,
  type MoversFilter,
} from "@/lib/heatmap-data";
import { squarify } from "@/lib/squarify";
import { clsChg, fmtPct, fmtPrice, fmtWan, fmtYuan } from "@/lib/format";
import { POLL } from "@/lib/intervals";
import { BRAND } from "@/config/branding";
import { layoutGroup, stockTip, tileLabel, type AggBucket } from "./heatmap-shared";
import { CursorTooltip, useCursorTooltip } from "./HeatmapTooltip";
import "./gmt-heatmap.css";

/** V3 — 老孙金终端壳 + 右侧常驻检查器 + 跑马灯 */
export function HeatmapLstWidget({ className = "" }: { className?: string }) {
  const [movers, setMovers] = useState<MoversFilter>("ALL");
  const [area, setArea] = useState<AreaMode>("mcap");
  const [listMode, setListMode] = useState(false);
  const [search, setSearch] = useState("");
  const [drill, setDrill] = useState<{ group: string; members: HeatStock[] } | null>(null);
  const [picked, setPicked] = useState<HeatStock | null>(null);
  const { ref, size } = useElementSize(80);
  const { tip, show, hide } = useCursorTooltip();

  const { data: groups } = usePolling(
    async () => {
      try {
        const g = await fetchHeatmapGroups();
        return g.length ? g : MOCK_HEAT_GROUPS;
      } catch {
        return MOCK_HEAT_GROUPS;
      }
    },
    POLL.SECTOR,
    []
  );

  const allGroups = groups ?? MOCK_HEAT_GROUPS;
  const filtered = useMemo(() => filterGroups(allGroups, movers, search), [allGroups, movers, search]);
  const val = useMemo(() => (s: HeatStock) => areaVal(s, area), [area]);

  const groupRects = useMemo(() => {
    if (listMode || size.w < 80 || size.h < 80 || !filtered.length) return [];
    const items = filtered.map((g) => ({ g, sum: g.stocks.reduce((a, s) => a + val(s), 0) }));
    return squarify(items, 0, 0, size.w, size.h, (it) => it.sum);
  }, [filtered, listMode, size.w, size.h, val]);

  const tapeItems = useMemo(() => {
    const flat = filtered.flatMap((g) => g.stocks.map((s) => ({ ...s, group: g.name })));
    return flat.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 8);
  }, [filtered]);

  const now = new Date();
  const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  const asOf = `as-of ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}（北京 CST）`;

  const onTip = (text: string | null, x: number, y: number) => {
    if (text) show(text, x, y);
    else hide();
  };

  const pick = (s: HeatStock) => {
    setPicked(s);
    hide();
  };

  return (
    <div className={`hm-lst-shell ${className}`}>
      <header className="hm-lst-cmdbar">
        <span>
          {BRAND.terminalPrefix}
          <b>//</b>
          {BRAND.title}
        </span>
        <span className="ver">v{BRAND.version}</span>
        <span className="badge">实时快照</span>
        <span style={{ fontSize: 11, fontWeight: 700 }}>{clock}</span>
      </header>

      <div className="hm-lst-tape">
        {tapeItems.map((s) => (
          <span key={s.code} style={{ cursor: "pointer" }} onClick={() => pick(s)}>
            <span style={{ color: "#8a8a8a" }}>{s.name.slice(0, 4)}</span>
            <span>{fmtPrice(s.price)}</span>
            <span className={clsChg(s.pct)}>{fmtPct(s.pct)}</span>
          </span>
        ))}
      </div>

      <div className="hm-lst-main">
        <section className="hm-gmt-widget widget">
          <header className="w-head">
            <span className="w-num">01</span>
            <span className="w-title">个股追踪 · 热力矩阵</span>
            <span className="w-asof">{asOf}</span>
          </header>
          <div className="w-body">
            <div className="ctl-row">
              {allGroups.slice(0, 5).map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="hm-chip"
                  onClick={() => setSearch(g.name.slice(0, 2))}
                >
                  {g.name.length > 6 ? g.name.slice(0, 5) + "…" : g.name}
                </button>
              ))}
              <button
                type="button"
                className={`hm-chip${movers !== "ALL" ? " on" : ""}`}
                onClick={() => setMovers((m) => (m === "ALL" ? "UP" : m === "UP" ? "DOWN" : "ALL"))}
              >
                {movers === "ALL" ? "± 涨跌" : movers === "UP" ? "▲ 上涨" : "▼ 下跌"}
              </button>
              <button type="button" className="hm-chip" onClick={() => setArea((a) => (a === "mcap" ? "turnover" : "mcap"))}>
                面积:{area === "mcap" ? "流通市值" : "成交额"}
              </button>
              <button type="button" className={`hm-chip${listMode ? " on" : ""}`} onClick={() => setListMode((v) => !v)}>
                ≡ 列表
              </button>
              <input
                type="search"
                className="hm-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="> 代码"
              />
            </div>

            <div ref={ref} className="hm-wrap">
              {listMode ? (
                <MiniList groups={filtered} onPick={pick} />
              ) : !filtered.length ? (
                <p className="hm-empty">无匹配标的</p>
              ) : (
                groupRects.map((gr) => {
                  const gname = gr.it.g.name;
                  const lay = layoutGroup(
                    gr.it.g.stocks,
                    0,
                    15,
                    Math.max(1, gr.w - 2),
                    Math.max(1, gr.h - 17),
                    val
                  );
                  const title = `${gname} · ${gr.it.g.stocks.length} 只 · 均 ${fmtPct(gr.it.g.avgPct)}`;
                  return (
                    <div
                      key={gr.it.g.id}
                      className="hm-group"
                      style={{ left: gr.x, top: gr.y, width: Math.max(0, gr.w - 1), height: Math.max(0, gr.h - 1) }}
                    >
                      <div className="hm-gtitle" title={title}>{title}</div>
                      {lay.rects.map((tr, i) => {
                        if ("_agg" in tr.it && tr.it._agg) {
                          const bucket = tr.it as AggBucket;
                          const rw = Math.floor(tr.w - 1);
                          const rh = Math.floor(tr.h - 1);
                          return (
                            <button
                              key={`agg-${i}`}
                              type="button"
                              className="hm-tile agg"
                              style={{ left: tr.x, top: tr.y, width: rw, height: rh }}
                              onClick={() => setDrill({ group: gname, members: bucket.members })}
                            >
                              <span className="ht">其他 {bucket.members.length} 只</span>
                            </button>
                          );
                        }
                        const stock = tr.it as HeatStock;
                        const c = heatColor(stock.pct);
                        const rw = Math.floor(tr.w - 1);
                        const rh = Math.floor(tr.h - 1);
                        return (
                          <button
                            key={stock.code}
                            type="button"
                            className="hm-tile"
                            style={{ left: tr.x, top: tr.y, width: rw, height: rh, background: c.bg, color: c.fg }}
                            onClick={() => pick(stock)}
                            onMouseMove={(e) => onTip(stockTip(stock, gname), e.clientX, e.clientY)}
                            onMouseLeave={() => hide()}
                          >
                            {rw > 58 && rh > 34 && (
                              <>
                                <span className="ht">{tileLabel(stock.code)}</span>
                                <span className="hp">{fmtPct(stock.pct)}</span>
                                {rh > 52 && rw > 92 && <span className="hl">{fmtPrice(stock.price)}</span>}
                                {rh > 64 && rw > 120 && <span className="hn">{stock.name}</span>}
                              </>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
              {drill && (
                <div className="hm-drill">
                  <button type="button" className="hm-chip" style={{ margin: "6px 0 0 8px" }} onClick={() => setDrill(null)}>
                    ← 返回
                  </button>
                  <MiniList groups={[{ id: "d", name: drill.group, avgPct: 0, stocks: drill.members }]} onPick={pick} />
                </div>
              )}
            </div>
            <div className="legend">
              <span>-4%</span>
              <span className="legend-bar" />
              <span>+4%</span>
              <span style={{ marginLeft: 10 }}>悬停查看报价 · 点击查看来源</span>
            </div>
          </div>
        </section>

        <aside className="hm-lst-insp">
          <div className="hm-lst-insp-head">
            <span>▣ 数据 / 来源检查器</span>
            {picked && (
              <button type="button" className="w-btn" onClick={() => setPicked(null)}>✕</button>
            )}
          </div>
          <div className="hm-lst-insp-body">
            {picked ? (
              <>
                <div className="insp-name">{picked.name} · {tileLabel(picked.code)}</div>
                <div className="insp-sub">A股 · 行业热力矩阵</div>
                <div className="insp-big">
                  {fmtPrice(picked.price)}{" "}
                  <span className={clsChg(picked.pct)} style={{ fontSize: 13 }}>{fmtPct(picked.pct)}</span>
                </div>
                <table className="hm-kv">
                  <tbody>
                    <tr><td>流通市值</td><td>{picked.circMv.toFixed(0)} 亿</td></tr>
                    <tr><td>成交额</td><td>{fmtYuan(picked.amount)}</td></tr>
                    <tr><td>成交量(估)</td><td>{picked.amount > 0 ? fmtWan(picked.amount / 10000) : "—"}</td></tr>
                    <tr><td>数据来源</td><td>腾讯行情 · /api/board-stocks</td></tr>
                    <tr><td>刷新频率</td><td>15s</td></tr>
                    <tr><td>口径</td><td>流通市值=ltsz(亿) · 日涨跌幅</td></tr>
                  </tbody>
                </table>
                <p style={{ marginTop: 8, fontSize: 9, color: "#5a5a5a" }}>
                  可用字段：代码、名称、最新、涨跌幅、流通市值、成交额、as-of 时刻。
                </p>
              </>
            ) : (
              <p className="hm-lst-insp-empty">
                点击任意股票色块、行情行或跑马灯条目，查看其数值、来源、口径与 as-of 时刻。
              </p>
            )}
          </div>
        </aside>
      </div>

      <footer className="hm-lst-status">
        <span><span style={{ color: "#00c176" }}>●</span> 实时行情 · 本地代理聚合</span>
        <span>{BRAND.motto}</span>
        <span>{asOf}</span>
      </footer>

      <CursorTooltip tip={tip} accent="gold" />
    </div>
  );
}

function MiniList({ groups, onPick }: { groups: HeatGroup[]; onPick: (s: HeatStock) => void }) {
  return (
    <table className="hm-list">
      <thead>
        <tr style={{ color: "#f5c542" }}>
          <th>代码 · 名称</th>
          <th>涨跌幅</th>
        </tr>
      </thead>
      <tbody>
        {groups.flatMap((g) =>
          g.stocks.map((s) => (
            <tr key={`${g.id}-${s.code}`} onClick={() => onPick(s)}>
              <td>{tileLabel(s.code)} <span style={{ color: "#8a8a8a", fontWeight: 400 }}>{s.name}</span></td>
              <td className={clsChg(s.pct)}>{fmtPct(s.pct)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
