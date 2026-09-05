import { useEffect, useMemo, useState } from "react";
import { useQuotes } from "@/lib/market";
import { INDICES, FOREX } from "@/config/dashboard";
import { clsChg, fmtPct, fmtPrice } from "@/lib/format";
import { EXCHANGES, STATUS_LABEL, sessionOf } from "../gmt-sessions";
import { useGmtDemo } from "../gmt-context";

const DEFS = [...INDICES, ...FOREX];
const CODES = DEFS.map((d) => d.code);
const REGIONS: { key: string; title: string; regions: string[]; ex?: string }[] = [
  { key: "us", title: "美洲", regions: ["US"], ex: "NYSE" },
  { key: "hk", title: "亚太 · 港股", regions: ["HK"], ex: "HKEX" },
  { key: "cn", title: "亚太 · A 股", regions: ["CN"], ex: "SSE" },
  { key: "fx", title: "汇率", regions: ["FX"] },
];

/** 08 — 全球指数一览：按地区分组 + 交易时段徽标（复用统一报价中心） */
export function GmtIndicesWidget() {
  const quotes = useQuotes(CODES);
  const { openInspect, reportSource } = useGmtDemo();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(t);
  }, []);
  const n = quotes ? Object.keys(quotes).length : 0;
  useEffect(() => {
    if (n > 0) reportSource("quotes", "指数/汇率 · 统一报价中心", true, n);
  }, [n, reportSource]);

  const statusOf = useMemo(() => {
    const map: Record<string, { status: string; label: string }> = {};
    for (const r of REGIONS) {
      const ex = EXCHANGES.find((e) => e.code === r.ex);
      if (!ex) {
        map[r.key] = { status: "OPEN", label: "24h" };
        continue;
      }
      const s = sessionOf(ex, now);
      map[r.key] = { status: s.status, label: STATUS_LABEL[s.status] };
    }
    return map;
  }, [now]);

  return (
    <div className="gmt-rows">
      {REGIONS.map((r) => {
        const defs = DEFS.filter((d) => r.regions.includes(d.region));
        const st = statusOf[r.key];
        return (
          <div key={r.key}>
            <div className="gmt-ix-region">
              {r.title} <span className={`gmt-badge ${st.status}`} style={{ marginLeft: 6 }}>{st.label}</span>
            </div>
            <table className="gmt-ix-table">
              <tbody>
                {defs.map((d) => {
                  const q = quotes?.[d.code];
                  return (
                    <tr
                      key={d.code}
                      onClick={() =>
                        q &&
                        openInspect({
                          type: "index",
                          label: d.label,
                          price: q.price,
                          pct: q.pct,
                          rows: [["代码", d.code], ["市场状态", st.label], ["来源", "腾讯行情 · 统一报价中心 5s"]],
                        })
                      }
                    >
                      <td>
                        {d.label} <span style={{ color: "var(--gmt-faint)" }}>{d.code.replace(/^(sh|sz|hk|us|wh)/, "").toUpperCase()}</span>
                      </td>
                      <td className="r">{q ? fmtPrice(q.price) : "—"}</td>
                      <td className={`r ${q ? clsChg(q.pct) : "gmt-flat"}`}>{q ? fmtPct(q.pct) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
