import { useMemo, useState } from "react";
import { useElementSize } from "@/hooks/useElementSize";
import { heatColor } from "@/lib/heat-color";
import { areaVal, filterGroups, type HeatStock } from "@/lib/heatmap-data";
import { squarify, type SquarifyRect } from "@/lib/squarify";
import { clsChg, fmtPct, fmtPrice } from "@/lib/format";
import { layoutGroup, stockTip, tileLabel, type AggBucket } from "@/components/dash/heatmap/heatmap-shared";
import { CursorTooltip, useCursorTooltip } from "@/components/dash/heatmap/HeatmapTooltip";
import { useGmtDemo } from "../gmt-context";
import "@/components/dash/heatmap/gmt-heatmap.css";

function GmtChip({
  on,
  onClick,
  children,
  title,
}: {
  on?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button type="button" className={`hm-chip${on ? " on" : ""}`} title={title} onClick={onClick}>
      {children}
    </button>
  );
}

function GmtTile({
  stock,
  rect,
  group,
  onPick,
  onTip,
}: {
  stock: HeatStock;
  rect: SquarifyRect<HeatStock>;
  group: string;
  onPick: (s: HeatStock) => void;
  onTip: (t: string | null, x: number, y: number) => void;
}) {
  const c = heatColor(stock.pct);
  const rw = Math.floor(rect.w - 1);
  const rh = Math.floor(rect.h - 1);
  const label = tileLabel(stock.code);
  return (
    <button
      type="button"
      className="hm-tile"
      style={{ left: rect.x, top: rect.y, width: rw, height: rh, background: c.bg, color: c.fg }}
      onClick={() => onPick(stock)}
      onMouseMove={(e) => onTip(stockTip(stock, group), e.clientX, e.clientY)}
      onMouseLeave={() => onTip(null, 0, 0)}
    >
      {rw > 58 && rh > 34 && (
        <>
          <span className="ht">{label}</span>
          <span className="hp">{fmtPct(stock.pct)}</span>
          {rh > 52 && rw > 92 && <span className="hl">{fmtPrice(stock.price)}</span>}
          {rh > 64 && rw > 120 && <span className="hn">{stock.name}</span>}
        </>
      )}
      {!(rw > 58 && rh > 34) && rw > 28 && rh > 16 && (
        <span className="ht" style={{ fontSize: 8 }}>
          {label}
        </span>
      )}
    </button>
  );
}

/** 01 — 热力矩阵（共享 GMT 上下文） */
export function GmtHeatmapWidget() {
  const {
    groups,
    sector,
    setSector,
    movers,
    setMovers,
    area,
    setArea,
    search,
    setSearch,
    selectStock,
  } = useGmtDemo();
  const [listMode, setListMode] = useState(false);
  const [drill, setDrill] = useState<{ group: string; members: HeatStock[] } | null>(null);
  const { ref, size } = useElementSize(80);
  const { tip, show, hide } = useCursorTooltip();

  const sectorFiltered = useMemo(() => {
    if (sector === "ALL") return groups;
    return groups.filter((g) => g.id === sector);
  }, [groups, sector]);

  const filtered = useMemo(
    () => filterGroups(sectorFiltered, movers, search),
    [sectorFiltered, movers, search]
  );

  const val = useMemo(() => (s: HeatStock) => areaVal(s, area), [area]);

  const groupRects = useMemo(() => {
    if (listMode || size.w < 80 || size.h < 80 || !filtered.length) return [];
    const items = filtered.map((g) => ({ g, sum: g.stocks.reduce((a, s) => a + val(s), 0) }));
    return squarify(items, 0, 0, size.w, size.h, (it) => it.sum);
  }, [filtered, listMode, size.w, size.h, val]);

  const onTip = (text: string | null, x: number, y: number) => {
    if (text) show(text, x, y);
    else hide();
  };

  return (
    <div className="hm-gmt-widget h-full">
      <div className="w-body h-full">
        <div className="ctl-row">
          <GmtChip on={sector === "ALL"} onClick={() => setSector("ALL")}>
            全部
          </GmtChip>
          {groups.map((g) => (
            <GmtChip key={g.id} on={sector === g.id} onClick={() => setSector(g.id)}>
              {g.name.length > 8 ? g.name.slice(0, 7) + "…" : g.name}
            </GmtChip>
          ))}
          <GmtChip
            on={movers !== "ALL"}
            onClick={() => setMovers((m) => (m === "ALL" ? "UP" : m === "UP" ? "DOWN" : "ALL"))}
            title="切换上涨/下跌"
          >
            {movers === "ALL" ? "± 涨跌" : movers === "UP" ? "▲ 上涨" : "▼ 下跌"}
          </GmtChip>
          <GmtChip onClick={() => setArea((a) => (a === "mcap" ? "turnover" : "mcap"))}>
            面积:{area === "mcap" ? "总市值" : "成交额"}
          </GmtChip>
          <GmtChip on={listMode} onClick={() => setListMode((v) => !v)} title="列表视图">
            ≡ 列表
          </GmtChip>
          <input
            type="search"
            className="hm-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="> 代码"
            aria-label="搜索代码"
          />
        </div>

        <div ref={ref} className="hm-wrap">
          {listMode ? (
            <table className="hm-list">
              <thead>
                <tr style={{ color: "#F28C00" }}>
                  <th>代码 · 名称</th>
                  <th>最新</th>
                  <th>涨跌幅</th>
                </tr>
              </thead>
              <tbody>
                {filtered.flatMap((g) =>
                  g.stocks
                    .slice()
                    .sort((a, b) => b.pct - a.pct)
                    .map((s) => (
                      <tr key={`${g.id}-${s.code}`} onClick={() => selectStock(s)}>
                        <td>
                          {tileLabel(s.code)}{" "}
                          <span style={{ color: "#8a8a8a", fontWeight: 400 }}>{s.name}</span>
                        </td>
                        <td>{fmtPrice(s.price)}</td>
                        <td className={clsChg(s.pct)}>{fmtPct(s.pct)}</td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          ) : !filtered.length ? (
            <p className="hm-empty">无匹配标的 — 请清除搜索/筛选。</p>
          ) : (
            groupRects.map((gr) => {
              const gname = gr.it.g.name;
              const members = gr.it.g.stocks;
              const title = `${gname} · ${members.length} 只 · 均 ${fmtPct(gr.it.g.avgPct)}`;
              const lay = layoutGroup(members, 0, 15, Math.max(1, gr.w - 2), Math.max(1, gr.h - 17), val);
              return (
                <div
                  key={gr.it.g.id}
                  className="hm-group"
                  style={{ left: gr.x, top: gr.y, width: Math.max(0, gr.w - 1), height: Math.max(0, gr.h - 1) }}
                >
                  <div className="hm-gtitle" title={title}>
                    {title}
                  </div>
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
                          onMouseMove={(e) =>
                            onTip(
                              `其他 ${bucket.members.length} 只（${gname} 小市值聚合）\n加权均涨跌 ${fmtPct(bucket.pct)}\n点击展开明细`,
                              e.clientX,
                              e.clientY
                            )
                          }
                          onMouseLeave={() => hide()}
                        >
                          {rw > 44 && rh > 24 ? (
                            <>
                              <span className="ht">其他 {bucket.members.length} 只</span>
                              <span className="hp">{fmtPct(bucket.pct)}</span>
                            </>
                          ) : (
                            <span className="ht" style={{ fontSize: 8 }}>
                              其他
                            </span>
                          )}
                        </button>
                      );
                    }
                    return (
                      <GmtTile
                        key={(tr.it as HeatStock).code}
                        stock={tr.it as HeatStock}
                        rect={tr as SquarifyRect<HeatStock>}
                        group={gname}
                        onPick={selectStock}
                        onTip={onTip}
                      />
                    );
                  })}
                </div>
              );
            })
          )}

          {drill && (
            <div className="hm-drill">
              <button type="button" className="hm-chip" style={{ margin: "6px 0 0 8px" }} onClick={() => setDrill(null)}>
                ← 返回热力图
              </button>
              <table className="hm-list">
                <tbody>
                  {drill.members
                    .slice()
                    .sort((a, b) => b.pct - a.pct)
                    .map((s) => (
                      <tr key={s.code} onClick={() => selectStock(s)}>
                        <td>{tileLabel(s.code)} {s.name}</td>
                        <td className={clsChg(s.pct)}>{fmtPct(s.pct)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="legend">
          <span>-4%</span>
          <span className="legend-bar" />
          <span>+4%</span>
          <span style={{ marginLeft: 10 }}>红涨绿跌 · 面积:{area === "mcap" ? "流通市值" : "成交额"}</span>
        </div>
      </div>
      <CursorTooltip tip={tip} accent="amber" />
    </div>
  );
}
