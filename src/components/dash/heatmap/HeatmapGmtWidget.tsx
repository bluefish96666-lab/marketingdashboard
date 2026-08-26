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
import { squarify, type SquarifyRect } from "@/lib/squarify";
import { clsChg, fmtPct, fmtPrice, fmtYuan } from "@/lib/format";
import { POLL } from "@/lib/intervals";
import { layoutGroup, stockTip, tileLabel, type AggBucket } from "./heatmap-shared";
import { CursorTooltip, useCursorTooltip } from "./HeatmapTooltip";
import "./gmt-heatmap.css";

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
      {!(rw > 58 && rh > 34) && rw > 28 && rh > 16 && <span className="ht" style={{ fontSize: 8 }}>{label}</span>}
    </button>
  );
}

/** V2 — GMT 琥珀终端复刻（硬边、IBM Mono、游标 tooltip、板块 chip） */
export function HeatmapGmtWidget({ className = "" }: { className?: string }) {
  const [sector, setSector] = useState<string>("ALL");
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

  const sectorFiltered = useMemo(() => {
    if (sector === "ALL") return allGroups;
    return allGroups.filter((g) => g.id === sector);
  }, [allGroups, sector]);

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

  const now = new Date();
  const asOf = `as-of ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}（北京 CST）`;

  const onTip = (text: string | null, x: number, y: number) => {
    if (text) show(text, x, y);
    else hide();
  };

  return (
    <section className={`hm-gmt-widget widget ${className}`}>
      <header className="w-head">
        <span className="w-num">01</span>
        <span className="w-title">个股追踪 · 热力矩阵</span>
        <span className="w-asof">{asOf}</span>
        <button type="button" className="w-btn" title="放大" aria-label="放大">⤢</button>
        <button type="button" className="w-btn" title="关闭" aria-label="关闭">✕</button>
      </header>

      <div className="w-body">
        <div className="ctl-row">
          <GmtChip on={sector === "ALL"} onClick={() => setSector("ALL")}>全部</GmtChip>
          {allGroups.map((g) => (
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
            <ListTable groups={filtered} onPick={setPicked} accent="amber" />
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
                            <span className="ht" style={{ fontSize: 8 }}>其他</span>
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
                        onPick={setPicked}
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
              <ListTable
                groups={[{ id: "drill", name: drill.group, avgPct: 0, stocks: drill.members }]}
                onPick={setPicked}
                accent="amber"
              />
            </div>
          )}
        </div>

        <div className="legend">
          <span>-4%</span>
          <span className="legend-bar" />
          <span>+4%</span>
          <span style={{ marginLeft: 10 }}>颜色：日涨跌幅（红涨绿跌，强度=幅度）</span>
          <span style={{ marginLeft: 10 }}>面积：{area === "mcap" ? "流通市值（亿）" : "成交额（元）"}</span>
        </div>
      </div>

      <CursorTooltip tip={tip} accent="amber" />

      {picked && (
        <InspectOverlay stock={picked} onClose={() => setPicked(null)} theme="gmt" />
      )}
    </section>
  );
}

function ListTable({
  groups,
  onPick,
  accent,
}: {
  groups: HeatGroup[];
  onPick: (s: HeatStock) => void;
  accent: "amber" | "gold";
}) {
  const thColor = accent === "amber" ? "#F28C00" : "#f5c542";
  return (
    <table className="hm-list">
      <thead>
        <tr style={{ color: thColor }}>
          <th>代码 · 名称</th>
          <th>最新</th>
          <th>涨跌</th>
          <th>涨跌幅</th>
          <th>流通市值</th>
        </tr>
      </thead>
      <tbody>
        {groups.flatMap((g) =>
          g.stocks
            .slice()
            .sort((a, b) => b.pct - a.pct)
            .map((s) => (
              <tr key={`${g.id}-${s.code}`} onClick={() => onPick(s)}>
                <td>
                  {tileLabel(s.code)} <span style={{ color: "#8a8a8a", fontWeight: 400 }}>{s.name}</span>
                </td>
                <td>{fmtPrice(s.price)}</td>
                <td className={clsChg(s.pct)}>{s.pct > 0 ? "+" : ""}{s.pct.toFixed(2)}</td>
                <td className={clsChg(s.pct)}>{fmtPct(s.pct)}</td>
                <td>{s.circMv.toFixed(0)}亿</td>
              </tr>
            ))
        )}
      </tbody>
    </table>
  );
}

function InspectOverlay({
  stock,
  onClose,
  theme,
}: {
  stock: HeatStock;
  onClose: () => void;
  theme: "gmt" | "lst";
}) {
  const accent = theme === "gmt" ? "#F28C00" : "#f5c542";
  return (
    <div className="hm-inspect-overlay" onClick={onClose}>
      <div className="hm-inspect-box" onClick={(e) => e.stopPropagation()} style={{ borderColor: accent }}>
        <div className="hm-inspect-head">
          <span style={{ color: accent }}>▣ 数据 / 来源检查器</span>
          <button type="button" className="w-btn" onClick={onClose}>✕</button>
        </div>
        <div className="hm-inspect-body">
          <div className="insp-name">{stock.name} · {tileLabel(stock.code)}</div>
          <div className="insp-sub">A股 · 流通市值 {stock.circMv.toFixed(0)} 亿</div>
          <div className="insp-big">
            {fmtPrice(stock.price)}{" "}
            <span className={clsChg(stock.pct)} style={{ fontSize: 13 }}>{fmtPct(stock.pct)}</span>
          </div>
          <table className="hm-kv">
            <tbody>
              <tr><td>成交额</td><td>{fmtYuan(stock.amount)}</td></tr>
              <tr><td>数据来源</td><td>腾讯行情 · /api/board-stocks</td></tr>
              <tr><td>口径</td><td>流通市值=ltsz(亿) · 日涨跌幅</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
