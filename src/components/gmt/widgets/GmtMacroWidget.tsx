import { useEffect } from "react";
import { useQuotes } from "@/lib/market";
import { useSharedPolling } from "@/hooks/useSharedPolling";
import { api } from "@/lib/api";
import { COMMODITIES } from "@/config/dashboard";
import { POLL } from "@/lib/intervals";
import { clsChg, fmtPct, fmtPrice } from "@/lib/format";
import { useGmtDemo } from "../gmt-context";

const CODES = COMMODITIES.map((c) => c.code);
const TENORS = ["US2Y", "US5Y", "US10Y", "US30Y"];

/** 08 — 商品期货 + 美债收益率 */
export function GmtMacroWidget() {
  const futures = useQuotes(CODES);
  const { data: treasuries } = useSharedPolling("gmt:treasury", () => api.treasuries(), POLL.TREASURY_LIVE);
  const { reportSource } = useGmtDemo();
  const tn = treasuries?.length ?? 0;

  useEffect(() => {
    if (treasuries) reportSource("treasury", "美债收益率 · /api/treasuries", tn > 0, tn);
  }, [treasuries, tn, reportSource]);

  return (
    <div className="gmt-rows">
      <div className="gmt-row-sec">商品</div>
      {COMMODITIES.map((c) => {
        const q = futures?.[c.code];
        return (
          <div key={c.code} className="gmt-row" style={{ cursor: "default" }}>
            <span className="gmt-row-tag" style={{ color: c.accent }}>●</span>
            <span className="gmt-row-name">{c.label}</span>
            <span className="gmt-row-num">{q ? fmtPrice(q.price) : "—"}</span>
            <span className={`gmt-row-num ${q ? clsChg(q.pct) : "gmt-flat"}`}>{q ? fmtPct(q.pct) : "—"}</span>
          </div>
        );
      })}
      <div className="gmt-row-sec">美债</div>
      {TENORS.map((sym) => {
        const t = treasuries?.find((x) => x.symbol === sym);
        return (
          <div key={sym} className="gmt-row" style={{ cursor: "default" }}>
            <span className="gmt-row-tag">UST</span>
            <span className="gmt-row-name">{sym.replace("US", "")} 收益率</span>
            <span className="gmt-row-num">{t ? `${t.yield.toFixed(3)}%` : "—"}</span>
            <span className={`gmt-row-num ${t ? clsChg(t.change) : "gmt-flat"}`}>
              {t ? `${t.change > 0 ? "+" : ""}${(t.change * 100).toFixed(1)}bp` : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
