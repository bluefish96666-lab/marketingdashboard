import { useEffect, useMemo } from "react";
import { usePolling } from "@/hooks/usePolling";
import { api } from "@/lib/api";
import { POLL } from "@/lib/intervals";
import { clsChg, fmtPct, fmtPrice, fmtYuan } from "@/lib/format";
import { tileLabel } from "@/components/dash/heatmap/heatmap-shared";
import { useGmtDemo } from "../gmt-context";

/** 10 — 主力净流入 TOP15（东财口径，A 股特色），点击个股联动 04 分时 + 检查器 */
export function GmtFlowWidget() {
  const { selectStock, reportSource } = useGmtDemo();
  const { data, error } = usePolling(() => api.moneyflow(15), POLL.MONEYFLOW, []);
  const list = useMemo(() => data ?? [], [data]);
  const total = useMemo(() => list.reduce((a, s) => a + s.netIn, 0), [list]);

  useEffect(() => {
    if (data || error) reportSource("moneyflow", "东财资金流 · /api/moneyflow", !error && list.length > 0, list.length);
  }, [data, error, list.length, reportSource]);

  return (
    <>
      <div className="gmt-chart-stats">
        <span>TOP15 合计</span>
        <span className={clsChg(total)}>{fmtYuan(total)}</span>
        <span style={{ marginLeft: "auto", color: "var(--gmt-faint)" }}>净额 · 净占比</span>
      </div>
      <div className="gmt-rows">
        {!list.length ? (
          <p className="gmt-insp-empty" style={{ padding: 8 }}>
            {error ? "资金流数据不可用" : "加载资金流…"}
          </p>
        ) : (
          list.map((s) => (
            <button
              key={s.symbol}
              type="button"
              className="gmt-row"
              onClick={() =>
                selectStock({
                  code: s.symbol.replace(/^(sh|sz|bj)/i, ""),
                  name: s.name,
                  pct: s.pct,
                  price: s.price,
                  circMv: 0,
                  amount: s.amount,
                })
              }
            >
              <span className="gmt-row-tag">{tileLabel(s.symbol)}</span>
              <span className="gmt-row-name">{s.name}</span>
              <span className="gmt-row-num">{fmtPrice(s.price)}</span>
              <span className={`gmt-row-num ${clsChg(s.pct)}`}>{fmtPct(s.pct)}</span>
              <span className={`gmt-row-num ${clsChg(s.netIn)}`}>{fmtYuan(s.netIn)}</span>
              <span className={`gmt-row-num ${clsChg(s.netRatio)}`}>{fmtPct(s.netRatio, 1)}</span>
            </button>
          ))
        )}
      </div>
    </>
  );
}
