import { useEffect, useMemo, useState } from "react";
import { useQuotes } from "@/lib/market";
import { usePolling } from "@/hooks/usePolling";
import { api } from "@/lib/api";
import { useElementSize } from "@/hooks/useElementSize";
import { clsChg, fmtPct, fmtPrice } from "@/lib/format";
import { useGmtDemo } from "../gmt-context";

const METALS = [
  { code: "hf_GC", sym: "GC", name: "纽约黄金", unit: "COMEX · 美元/盎司" },
  { code: "hf_XAU", sym: "XAU", name: "伦敦金", unit: "现货 · 美元/盎司" },
  { code: "nf_AU0", sym: "AU", name: "沪金", unit: "SHFE · 元/克" },
  { code: "hf_SI", sym: "SI", name: "纽约白银", unit: "COMEX · 美元/盎司" },
];
const CODES = METALS.map((m) => m.code);
const OZ_G = 31.1035;

/** 06 — 贵金属：四卡报价 + 衍生比价（金银比 / 沪金内外盘价差）+ 期货日线 */
export function GmtMetalsWidget() {
  const q = useQuotes([...CODES, "whUSDCNY"]);
  const [sel, setSel] = useState("hf_GC");
  const { ref, size } = useElementSize(40);
  const { openInspect, reportSource } = useGmtDemo();
  const { data: daily, error } = usePolling(() => api.futureDaily(sel), 300000, [sel]);

  const n = CODES.filter((c) => q?.[c]).length;
  useEffect(() => {
    if (n) reportSource("metals", "贵金属期货 · 新浪 hf/nf", true, n);
  }, [n, reportSource]);
  useEffect(() => {
    if (daily || error) reportSource("future-daily", "期货日线 · /api/future-daily", !error && (daily?.points.length ?? 0) > 0, daily?.points.length ?? 0);
  }, [daily, error, reportSource]);

  const derived = useMemo(() => {
    const gc = q?.hf_GC?.price;
    const si = q?.hf_SI?.price;
    const xau = q?.hf_XAU?.price;
    const au = q?.nf_AU0?.price;
    const fx = q?.whUSDCNY?.price;
    const out: [string, string, string][] = [];
    if (gc && si) out.push(["金银比", (gc / si).toFixed(1), "GC / SI"]);
    if (gc && xau) out.push(["期现价差", `${(gc - xau) > 0 ? "+" : ""}${(gc - xau).toFixed(2)}`, "GC − XAU 美元/盎司"]);
    if (xau && au && fx) {
      const implied = (xau * fx) / OZ_G;
      out.push(["沪金内外盘", `${au > implied ? "+" : ""}${(au - implied).toFixed(2)} 元/克`, `沪金 − 伦敦金×USDCNY÷${OZ_G}`]);
    }
    return out;
  }, [q]);

  const pts = useMemo(() => (daily?.points ?? []).slice(-60), [daily]);
  const W = Math.max(size.w, 100);
  const H = Math.max(size.h, 60);
  const closes = pts.map((p) => p.c);
  let lo = Math.min(...closes, Infinity);
  let hi = Math.max(...closes, -Infinity);
  if (!Number.isFinite(lo)) {
    lo = 0;
    hi = 1;
  }
  const padv = (hi - lo || 1) * 0.08;
  lo -= padv;
  hi += padv;
  const X = (i: number) => 4 + (i / Math.max(1, pts.length - 1)) * (W - 52);
  const Y = (v: number) => H - 14 - ((v - lo) / (hi - lo)) * (H - 22);
  const selMeta = METALS.find((m) => m.code === sel)!;
  const first = closes[0];
  const last = closes[closes.length - 1];
  const lineColor = last >= first ? "var(--gmt-up)" : "var(--gmt-down)";

  return (
    <>
      <div className="gmt-met-quotes">
        {METALS.map((m) => {
          const qq = q?.[m.code];
          return (
            <button
              key={m.code}
              type="button"
              className={`gmt-met-q${sel === m.code ? " sel" : ""}`}
              onClick={() => {
                setSel(m.code);
                if (qq) openInspect({ type: "metal", label: `${m.name} · ${m.sym}`, price: qq.price, pct: qq.pct, rows: [["单位", m.unit], ["来源", "新浪期货行情 · 统一报价中心 5s"], ["日线", "/api/future-daily · 5 分钟缓存"]] });
              }}
            >
              <span className="mn">{m.sym} <span style={{ fontWeight: 400, color: "var(--gmt-dim)" }}>{m.name}</span></span>
              <span className="mu">{m.unit}</span>
              <span className="ml">{qq ? fmtPrice(qq.price) : "—"}</span>
              <span className={`mc ${qq ? clsChg(qq.pct) : "gmt-flat"}`}>{qq ? fmtPct(qq.pct) : "—"}</span>
            </button>
          );
        })}
      </div>
      <div className="gmt-met-derived">
        {derived.map(([l, v, note]) => (
          <span key={l} className="gmt-met-d" title={note}>
            {l}<b>{v}</b>
          </span>
        ))}
        {!derived.length && <span className="gmt-met-d">衍生指标待报价…</span>}
      </div>
      <div className="gmt-chart-readout">
        {selMeta.sym} · 近 {pts.length} 个交易日收盘 · {pts.length ? `${pts[0].t} → ${pts[pts.length - 1].t}` : "加载日线…"}
      </div>
      <div ref={ref} className="gmt-sector-chart">
        {size.w > 0 && pts.length > 1 && (
          <svg width={W} height={H} style={{ display: "block" }}>
            {[0, 0.5, 1].map((f) => {
              const v = lo + (hi - lo) * f;
              return (
                <g key={f}>
                  <line x1={4} x2={W - 48} y1={Y(v)} y2={Y(v)} stroke="#292929" strokeDasharray="2,3" />
                  <text x={W - 44} y={Y(v) + 3} fill="#5a5a5a" fontSize={8}>{fmtPrice(v)}</text>
                </g>
              );
            })}
            <polyline fill="none" stroke={lineColor} strokeWidth={1.3} points={pts.map((p, i) => `${X(i).toFixed(1)},${Y(p.c).toFixed(1)}`).join(" ")} />
            <text x={4} y={H - 3} fill="#5a5a5a" fontSize={8}>{pts[0].t.slice(5)}</text>
            <text x={W - 92} y={H - 3} fill="#5a5a5a" fontSize={8}>{pts[pts.length - 1].t.slice(5)}</text>
          </svg>
        )}
        {size.w > 0 && pts.length <= 1 && <div className="gmt-insp-empty" style={{ padding: 8 }}>{error ? "日线不可用" : "加载日线…"}</div>}
      </div>
      <div className="gmt-chart-note">来源：新浪期货 hf_/nf_ 实时 · 日线 /api/future-daily · 汇率 whUSDCNY 用于内外盘换算</div>
    </>
  );
}
