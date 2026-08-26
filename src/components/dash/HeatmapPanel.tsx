import { useMemo, useState, type ReactNode } from "react";
import { Grid3X3 } from "lucide-react";
import { ACCENT } from "@/config/branding";
import { Panel, type PanelZoomProps } from "./Panel";
import { useElementSize } from "@/hooks/useElementSize";
import { usePolling } from "@/hooks/usePolling";
import { heatColor } from "@/lib/heat-color";
import {
  areaVal,
  fetchHeatmapGroups,
  filterGroups,
  MOCK_HEAT_GROUPS,
  type AreaMode,
  type HeatStock,
  type MoversFilter,
} from "@/lib/heatmap-data";
import { MIN_TILE, squarify, type SquarifyRect } from "@/lib/squarify";
import { clsChg, fmtPct, fmtPrice, fmtYuan } from "@/lib/format";
import { POLL } from "@/lib/intervals";

type AggStock = HeatStock & { _agg?: false };
type AggBucket = { _agg: true; members: HeatStock[]; pct: number; t: string };

function makeAgg(members: HeatStock[], val: (s: HeatStock) => number): AggBucket {
  const sum = members.reduce((a, s) => a + val(s), 0);
  const pct = sum > 0 ? members.reduce((a, s) => a + s.pct * val(s), 0) / sum : 0;
  return { _agg: true, members, pct, t: "其他" };
}

function layoutGroup(
  members: HeatStock[],
  gx: number,
  gy: number,
  gw: number,
  gh: number,
  val: (s: HeatStock) => number
): { rects: SquarifyRect<AggStock | AggBucket>[]; aggMembers: HeatStock[] } {
  let keep = members.slice();
  let aggMembers: HeatStock[] = [];
  for (let pass = 0; pass < 12; pass++) {
    const items: (AggStock | AggBucket)[] = aggMembers.length
      ? [...keep, makeAgg(aggMembers, val)]
      : keep;
    const rects = squarify(items, gx, gy, gw, gh, (it) =>
      "_agg" in it && it._agg ? it.members.reduce((a, s) => a + val(s), 0) : val(it as HeatStock)
    );
    let aggRect: SquarifyRect<AggBucket> | undefined;
    const smallIdx: number[] = [];
    rects.forEach((r, i) => {
      if ("_agg" in r.it && r.it._agg) {
        aggRect = r as SquarifyRect<AggBucket>;
        return;
      }
      if (Math.floor(r.w - 1) < MIN_TILE || Math.floor(r.h - 1) < MIN_TILE) smallIdx.push(i);
    });
    const aggTooSmall =
      aggRect != null &&
      (Math.floor(aggRect.w - 1) < MIN_TILE || Math.floor(aggRect.h - 1) < MIN_TILE);
    if (!smallIdx.length && !aggTooSmall) return { rects, aggMembers };
    if (smallIdx.length) {
      const smalls = smallIdx.map((i) => items[i] as HeatStock);
      aggMembers = aggMembers.concat(smalls);
      keep = items.filter((it, i) => smallIdx.indexOf(i) < 0 && !("_agg" in it && it._agg)) as HeatStock[];
    } else if (aggTooSmall && keep.length) {
      let minI = 0;
      keep.forEach((it, i) => {
        if (val(it) < val(keep[minI])) minI = i;
      });
      aggMembers.push(keep[minI]);
      keep.splice(minI, 1);
    } else {
      aggMembers = members.slice();
      keep = [];
      const only = [makeAgg(aggMembers, val)];
      return { rects: squarify(only, gx, gy, gw, gh, (it) => it.members.reduce((a, s) => a + val(s), 0)), aggMembers };
    }
  }
  const items: (AggStock | AggBucket)[] = aggMembers.length ? [...keep, makeAgg(aggMembers, val)] : keep;
  return {
    rects: squarify(items, gx, gy, gw, gh, (it) =>
      "_agg" in it && it._agg ? it.members.reduce((a, s) => a + val(s), 0) : val(it as HeatStock)
    ),
    aggMembers,
  };
}

function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded border px-1.5 py-0.5 text-[9px] font-medium tracking-wide transition-colors ${
        active
          ? "border-[#f5c542]/60 bg-[#f5c542]/20 text-[#fde68a]"
          : "border-slate-700/60 text-slate-500 hover:border-[#f5c542]/40 hover:text-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

function StockTile({
  stock,
  rect,
  onPick,
  onHover,
}: {
  stock: HeatStock;
  rect: SquarifyRect<HeatStock>;
  onPick: (s: HeatStock) => void;
  onHover: (tip: string | null) => void;
}) {
  const c = heatColor(stock.pct);
  const rw = Math.floor(rect.w - 1);
  const rh = Math.floor(rect.h - 1);
  const tip = `${stock.code} ${stock.name}\n最新 ${fmtPrice(stock.price)}  ${fmtPct(stock.pct)}\n流通市值 ${stock.circMv.toFixed(0)}亿 · 成交额 ${fmtYuan(stock.amount)}`;
  return (
    <button
      type="button"
      className="absolute flex flex-col items-center justify-center overflow-hidden border border-black/80 text-center leading-tight transition-[outline] hover:outline hover:outline-1 hover:outline-[#f5c542]"
      style={{ left: rect.x, top: rect.y, width: rw, height: rh, background: c.bg, color: c.fg }}
      onClick={() => onPick(stock)}
      onMouseEnter={() => onHover(tip)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(tip)}
      onBlur={() => onHover(null)}
    >
      {rw > 58 && rh > 34 && (
        <>
          <span className="text-[11px] font-bold">{stock.code.slice(-6)}</span>
          <span className="text-[10px] font-semibold">{fmtPct(stock.pct)}</span>
          {rh > 52 && rw > 92 && <span className="text-[10px] opacity-90">{fmtPrice(stock.price)}</span>}
          {rh > 64 && rw > 120 && <span className="max-w-full truncate px-0.5 text-[8px] opacity-75">{stock.name}</span>}
        </>
      )}
      {!(rw > 58 && rh > 34) && rw > 28 && rh > 16 && (
        <span className="text-[8px] font-bold">{stock.code.slice(-6)}</span>
      )}
    </button>
  );
}

export function HeatmapPanel({
  className = "",
  demo = false,
  ...zoomProps
}: { className?: string; demo?: boolean } & PanelZoomProps) {
  const [movers, setMovers] = useState<MoversFilter>("ALL");
  const [area, setArea] = useState<AreaMode>("mcap");
  const [listMode, setListMode] = useState(false);
  const [search, setSearch] = useState("");
  const [drill, setDrill] = useState<{ group: string; members: HeatStock[] } | null>(null);
  const [picked, setPicked] = useState<HeatStock | null>(null);
  const [tip, setTip] = useState<string | null>(null);
  const { ref, size } = useElementSize(80);

  const { data: groups, error } = usePolling(
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

  const filtered = useMemo(
    () => filterGroups(groups ?? MOCK_HEAT_GROUPS, movers, search),
    [groups, movers, search]
  );

  const val = useMemo(() => (s: HeatStock) => areaVal(s, area), [area]);

  const groupRects = useMemo(() => {
    if (listMode || size.w < 80 || size.h < 80 || !filtered.length) return [];
    const items = filtered.map((g) => ({
      g,
      sum: g.stocks.reduce((a, s) => a + val(s), 0),
    }));
    return squarify(items, 1, 1, size.w - 2, size.h - 2, (it) => it.sum);
  }, [filtered, listMode, size.w, size.h, val]);

  const asOf = demo ? "演示数据 · 接口可用时自动切换实时" : error ? "演示数据(接口离线)" : "实时 · 腾讯行业榜";

  return (
    <Panel
      className={className}
      {...zoomProps}
      title="个股追踪 · 热力矩阵"
      icon={<Grid3X3 size={14} />}
      accent={ACCENT.primary}
      right={
        <span className="font-mono text-[9px] text-slate-600">{asOf}</span>
      }
    >
      <div className="flex h-full min-h-0 flex-col bg-black">
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-[#292929] bg-[#050505] px-2 py-1">
          <Chip active={movers === "ALL"} onClick={() => setMovers("ALL")} title="全部涨跌">
            ± 涨跌
          </Chip>
          <Chip
            active={movers !== "ALL"}
            onClick={() => setMovers((m) => (m === "ALL" ? "UP" : m === "UP" ? "DOWN" : "ALL"))}
            title="切换上涨/下跌"
          >
            {movers === "UP" ? "▲ 上涨" : movers === "DOWN" ? "▼ 下跌" : "± 筛选"}
          </Chip>
          <Chip
            onClick={() => setArea((a) => (a === "mcap" ? "turnover" : "mcap"))}
            title="色块面积编码"
          >
            面积:{area === "mcap" ? "流通市值" : "成交额"}
          </Chip>
          <Chip active={listMode} onClick={() => setListMode((v) => !v)} title="列表视图">
            ≡ 列表
          </Chip>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="> 代码"
            aria-label="搜索代码"
            className="ml-auto w-20 border border-[#3a3a3a] bg-black px-1.5 py-0.5 font-mono text-[10px] text-slate-300 outline-none focus:border-[#f5c542]/60"
          />
        </div>

        <div ref={ref} className="relative min-h-0 flex-1 overflow-hidden">
          {listMode ? (
            <div className="h-full overflow-auto">
              <table className="w-full border-collapse font-mono text-[10px]">
                <thead className="sticky top-0 bg-black text-[#f5c542]">
                  <tr>
                    <th className="border-b border-[#292929] px-2 py-1 text-left">代码 · 名称</th>
                    <th className="border-b border-[#292929] px-2 py-1 text-right">最新</th>
                    <th className="border-b border-[#292929] px-2 py-1 text-right">涨跌幅</th>
                    <th className="border-b border-[#292929] px-2 py-1 text-right">流通市值</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.flatMap((g) =>
                    g.stocks
                      .slice()
                      .sort((a, b) => b.pct - a.pct)
                      .map((s) => (
                        <tr
                          key={`${g.id}-${s.code}`}
                          className="cursor-pointer hover:bg-[#1a1000]"
                          onClick={() => setPicked(s)}
                        >
                          <td className="border-b border-[#292929] px-2 py-1">
                            {s.code}{" "}
                            <span className="text-slate-500">{s.name}</span>
                            <span className="ml-1 text-[9px] text-[#f5c542]/60">{g.name}</span>
                          </td>
                          <td className="border-b border-[#292929] px-2 py-1 text-right">{fmtPrice(s.price)}</td>
                          <td className={`border-b border-[#292929] px-2 py-1 text-right ${clsChg(s.pct)}`}>
                            {fmtPct(s.pct)}
                          </td>
                          <td className="border-b border-[#292929] px-2 py-1 text-right">{s.circMv.toFixed(0)}亿</td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          ) : !filtered.length ? (
            <p className="p-4 text-[11px] text-slate-500">无匹配标的 — 请清除搜索/筛选。</p>
          ) : (
            groupRects.map((gr) => {
              const members = gr.it.g.stocks;
              const gname = gr.it.g.name;
              const pctTxt = fmtPct(gr.it.g.avgPct);
              const title = `${gname} · ${members.length} 只 · 均 ${pctTxt}`;
              const lay = layoutGroup(
                members,
                1,
                15,
                Math.max(1, gr.w - 3),
                Math.max(1, gr.h - 17),
                val
              );
              return (
                <div
                  key={gr.it.g.id}
                  className="absolute border border-[#3a3a3a]"
                  style={{
                    left: gr.x,
                    top: gr.y,
                    width: Math.max(0, gr.w - 1),
                    height: Math.max(0, gr.h - 1),
                  }}
                >
                  <div
                    className="absolute left-0 right-0 top-0 z-[2] h-[14px] truncate border-b border-[#292929] bg-black px-1 text-[9px] font-bold tracking-wide text-[#f5c542]"
                    title={title}
                  >
                    {title}
                  </div>
                  {lay.rects.map((tr, i) => {
                    if ("_agg" in tr.it && tr.it._agg) {
                      const bucket = tr.it;
                      const rw = Math.floor(tr.w - 1);
                      const rh = Math.floor(tr.h - 1);
                      const c = heatColor(bucket.pct);
                      return (
                        <button
                          key={`agg-${i}`}
                          type="button"
                          className="absolute flex flex-col items-center justify-center border border-dashed border-[#3a3a3a] text-center"
                          style={{ left: tr.x, top: tr.y, width: rw, height: rh, background: "#101010", color: c.fg }}
                          onClick={() => setDrill({ group: gname, members: bucket.members })}
                        >
                          {rw > 44 && rh > 24 ? (
                            <>
                              <span className="text-[10px] font-bold text-[#f5c542]">其他 {bucket.members.length} 只</span>
                              <span className="text-[10px]">{fmtPct(bucket.pct)}</span>
                            </>
                          ) : (
                            <span className="text-[8px] text-[#f5c542]">其他</span>
                          )}
                        </button>
                      );
                    }
                    return (
                      <StockTile
                        key={(tr.it as HeatStock).code}
                        stock={tr.it as HeatStock}
                        rect={tr as SquarifyRect<HeatStock>}
                        onPick={setPicked}
                        onHover={setTip}
                      />
                    );
                  })}
                </div>
              );
            })
          )}

          {drill && (
            <div className="absolute inset-0 z-20 flex flex-col bg-[#050505]/98">
              <button
                type="button"
                className="m-2 w-fit border border-[#3a3a3a] px-2 py-0.5 text-[10px] text-[#f5c542] hover:bg-[#1a1000]"
                onClick={() => setDrill(null)}
              >
                ← 返回热力图
              </button>
              <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
                <div className="mb-1 text-[10px] text-slate-500">{drill.group} · 小市值聚合明细</div>
                <table className="w-full border-collapse font-mono text-[10px]">
                  <thead>
                    <tr className="text-[#f5c542]">
                      <th className="border-b border-[#292929] py-1 text-left">代码 · 名称</th>
                      <th className="border-b border-[#292929] py-1 text-right">涨跌幅</th>
                      <th className="border-b border-[#292929] py-1 text-right">市值</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drill.members
                      .slice()
                      .sort((a, b) => b.circMv - a.circMv)
                      .map((s) => (
                        <tr key={s.code} className="cursor-pointer hover:bg-[#1a1000]" onClick={() => setPicked(s)}>
                          <td className="border-b border-[#292929] py-1">{s.code} <span className="text-slate-500">{s.name}</span></td>
                          <td className={`border-b border-[#292929] py-1 text-right ${clsChg(s.pct)}`}>{fmtPct(s.pct)}</td>
                          <td className="border-b border-[#292929] py-1 text-right">{s.circMv.toFixed(0)}亿</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tip && (
            <div className="pointer-events-none absolute bottom-2 left-2 z-30 max-w-xs whitespace-pre-wrap rounded border border-[#f5c542]/40 bg-black/95 px-2 py-1 font-mono text-[10px] text-slate-300 shadow-lg">
              {tip}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-[#292929] px-2 py-0.5 text-[9px] text-slate-600">
          <span>-4%</span>
          <span
            className="inline-block h-2 w-28 border border-[#3a3a3a]"
            style={{
              background:
                "linear-gradient(90deg,#004D30 0%,#0B2A1B 25%,#141414 50%,#2A0B0C 75%,#5A1416 100%)",
            }}
          />
          <span>+4%</span>
          <span className="ml-2">颜色：日涨跌幅 · 面积：{area === "mcap" ? "流通市值" : "成交额"}</span>
        </div>

        {picked && (
          <div className="absolute bottom-8 right-2 z-40 w-56 rounded border border-[#f5c542]/40 bg-[#0a0a0a] p-2 text-[10px] shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-slate-200">{picked.name}</div>
                <div className="font-mono text-slate-500">{picked.code}</div>
              </div>
              <button type="button" className="text-slate-500 hover:text-slate-300" onClick={() => setPicked(null)}>
                ✕
              </button>
            </div>
            <div className={`mt-1 text-lg font-bold ${clsChg(picked.pct)}`}>
              {fmtPrice(picked.price)} {fmtPct(picked.pct)}
            </div>
            <div className="mt-1 space-y-0.5 text-slate-500">
              <div>流通市值 {picked.circMv.toFixed(0)} 亿</div>
              <div>成交额 {fmtYuan(picked.amount)}</div>
            </div>
            <p className="mt-2 text-[9px] text-slate-600">正式版将接入检查器面板</p>
          </div>
        )}
      </div>
    </Panel>
  );
}
