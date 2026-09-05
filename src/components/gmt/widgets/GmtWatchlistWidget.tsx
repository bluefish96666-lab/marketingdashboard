import { useEffect, useMemo } from "react";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useQuotes } from "@/lib/market";
import { clsChg, fmtPct, fmtPrice } from "@/lib/format";
import { tileLabel } from "@/components/dash/heatmap/heatmap-shared";
import type { HeatStock } from "@/lib/heatmap-data";
import { useGmtDemo } from "../gmt-context";

/** 11 — 自选股：与经典看板共用列表，点击联动 04 图表 */
export function GmtWatchlistWidget() {
  const { codes } = useWatchlist();
  const quotes = useQuotes(codes);
  const { selectStock, openInspect, reportSource } = useGmtDemo();

  const rows = useMemo(
    () =>
      codes.map((code) => {
        const q = quotes[code];
        return {
          code,
          name: q?.name || code,
          price: q?.price ?? 0,
          pct: q?.pct ?? 0,
          ok: !!q?.price,
        };
      }),
    [codes, quotes]
  );

  const nOk = rows.filter((r) => r.ok).length;
  useEffect(() => {
    reportSource("watchlist", "自选股 · 与经典看板共用", codes.length > 0, nOk);
  }, [codes.length, nOk, reportSource]);

  if (!codes.length) {
    return (
      <div className="gmt-insp-empty flex h-full items-center justify-center px-3 text-center">
        自选为空 — 在经典看板添加后此处同步显示
      </div>
    );
  }

  return (
    <div className="gmt-watch-wrap">
      <table className="gmt-watch-table">
        <thead>
          <tr>
            <th>代码</th>
            <th>名称</th>
            <th>最新</th>
            <th>涨跌幅</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.code}
              onClick={() => {
                const stock: HeatStock = {
                  code: r.code.replace(/^(sh|sz|bj)/i, ""),
                  name: r.name,
                  pct: r.pct,
                  price: r.price,
                  circMv: 100,
                  amount: 0,
                };
                selectStock(stock);
                openInspect({
                  type: "stock",
                  stock,
                  label: `${tileLabel(r.code)} ${r.name}`,
                  price: r.price,
                  pct: r.pct,
                  rows: [
                    ["来源", "自选股"],
                    ["代码", r.code],
                  ],
                });
              }}
            >
              <td className="sym">{tileLabel(r.code)}</td>
              <td className="nm">{r.name}</td>
              <td className={clsChg(r.pct)}>{r.price ? fmtPrice(r.price) : "—"}</td>
              <td className={clsChg(r.pct)}>{r.price ? fmtPct(r.pct) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="gmt-chart-note">
        来源：与经典看板自选共用 · {nOk}/{codes.length} 有报价 · 点击联动 04
      </div>
    </div>
  );
}
