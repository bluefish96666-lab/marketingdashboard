import { useEffect, useMemo } from "react";
import { useSharedPolling } from "@/hooks/useSharedPolling";
import { api, type Treasury } from "@/lib/api";
import { POLL } from "@/lib/intervals";
import { clsChg } from "@/lib/format";
import { useGmtDemo } from "../gmt-context";

const ORDER = ["US3M", "US2Y", "US5Y", "US10Y", "US30Y"] as const;
const LABEL: Record<string, string> = {
  US3M: "3M",
  US2Y: "2Y",
  US5Y: "5Y",
  US10Y: "10Y",
  US30Y: "30Y",
};

/** 12 — 美债收益率：关键期限 + 2s10s / 10s30s 利差 */
export function GmtTreasuryWidget() {
  const { data, error } = useSharedPolling("gmt:treasury-panel", () => api.treasuries(), POLL.TREASURY_LIVE);
  const { openInspect, reportSource } = useGmtDemo();

  useEffect(() => {
    if (data || error) {
      reportSource("treasury-panel", "美债收益率 · /api/treasuries", !error && (data?.length ?? 0) > 0, data?.length ?? 0);
    }
  }, [data, error, reportSource]);

  const rows = useMemo(() => {
    if (!data) return [] as Treasury[];
    return ORDER.map((s) => data.find((d) => d.symbol === s)).filter(Boolean) as Treasury[];
  }, [data]);

  const by = useMemo(() => Object.fromEntries(rows.map((r) => [r.symbol, r])), [rows]);
  const s2 = by.US2Y?.yield;
  const s10 = by.US10Y?.yield;
  const s30 = by.US30Y?.yield;
  const spread2s10s = s2 != null && s10 != null ? s10 - s2 : null;
  const spread10s30s = s10 != null && s30 != null ? s30 - s10 : null;

  if (error) return <div className="gmt-insp-empty flex h-full items-center justify-center">美债暂不可用</div>;
  if (!rows.length) return <div className="gmt-insp-empty flex h-full items-center justify-center">加载美债…</div>;

  return (
    <div className="gmt-treas-wrap">
      <div className="gmt-treas-grid">
        {rows.map((r) => (
          <button
            key={r.symbol}
            type="button"
            className="gmt-treas-cell"
            onClick={() =>
              openInspect({
                type: "market",
                label: `美债 ${LABEL[r.symbol] || r.symbol}`,
                price: r.yield,
                pct: r.change,
                rows: [
                  ["期限", LABEL[r.symbol] || r.symbol],
                  ["收益率", `${r.yield.toFixed(3)}%`],
                  ["变动", `${r.change > 0 ? "+" : ""}${r.change.toFixed(3)}`],
                  ["来源", "美国财政部"],
                ],
              })
            }
          >
            <div className="tl">{LABEL[r.symbol] || r.symbol}</div>
            <div className="tv">{r.yield.toFixed(3)}%</div>
            <div className={`tc ${clsChg(r.change)}`}>
              {r.change > 0 ? "+" : ""}
              {r.change.toFixed(3)}
            </div>
          </button>
        ))}
      </div>
      <div className="gmt-treas-spreads">
        <span>
          2s10s{" "}
          <b className={spread2s10s != null ? clsChg(spread2s10s) : ""}>
            {spread2s10s != null ? `${spread2s10s > 0 ? "+" : ""}${spread2s10s.toFixed(3)}` : "—"}
          </b>
        </span>
        <span>
          10s30s{" "}
          <b className={spread10s30s != null ? clsChg(spread10s30s) : ""}>
            {spread10s30s != null ? `${spread10s30s > 0 ? "+" : ""}${spread10s30s.toFixed(3)}` : "—"}
          </b>
        </span>
      </div>
      <div className="gmt-chart-note">来源：美国财政部日报 · /api/treasuries · 与顶部跑马灯同源</div>
    </div>
  );
}
