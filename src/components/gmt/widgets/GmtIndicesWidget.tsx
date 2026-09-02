import { useEffect } from "react";
import { useQuotes } from "@/lib/market";
import { INDICES, FOREX } from "@/config/dashboard";
import { clsChg, fmtPct, fmtPrice } from "@/lib/format";
import { useGmtDemo } from "../gmt-context";

const DEFS = [...INDICES, ...FOREX];
const CODES = DEFS.map((d) => d.code);

/** 06 — 全球指数（复用统一报价中心，与行情带同帧） */
export function GmtIndicesWidget() {
  const quotes = useQuotes(CODES);
  const { setInspect, setInspectorOpen, reportSource } = useGmtDemo();
  const n = quotes ? Object.keys(quotes).length : 0;

  useEffect(() => {
    reportSource("quotes", "腾讯报价 · 指数/汇率", n > 0, n);
  }, [n, reportSource]);

  return (
    <div className="gmt-rows">
      {DEFS.map((d) => {
        const q = quotes?.[d.code];
        return (
          <button
            key={d.code}
            type="button"
            className="gmt-row"
            onClick={() =>
              q && (setInspect({ type: "index", indexLabel: d.label, indexPrice: q.price, indexPct: q.pct }), setInspectorOpen(true))
            }
          >
            <span className="gmt-row-tag">{d.region}</span>
            <span className="gmt-row-name">{d.label}</span>
            <span className="gmt-row-num">{q ? fmtPrice(q.price) : "—"}</span>
            <span className={`gmt-row-num ${q ? clsChg(q.pct) : "gmt-flat"}`}>{q ? fmtPct(q.pct) : "—"}</span>
          </button>
        );
      })}
    </div>
  );
}
