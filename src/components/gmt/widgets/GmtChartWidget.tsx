import { useMemo } from "react";
import { usePolling } from "@/hooks/usePolling";
import { api, type Quote } from "@/lib/api";
import { normalizeStockCode } from "@/lib/code";
import { clsChg, fmtPct, fmtPrice, fmtWan } from "@/lib/format";
import { POLL } from "@/lib/intervals";
import { Spark } from "@/components/dash/Spark";
import { tileLabel } from "@/components/dash/heatmap/heatmap-shared";
import { useGmtDemo } from "../gmt-context";

function Stat({ l, v, cls = "" }: { l: string; v: string; cls?: string }) {
  return (
    <div className="gmt-stat">
      <div className="sl">{l}</div>
      <div className={`sv ${cls}`}>{v}</div>
    </div>
  );
}

/** 04 — 选中标的：统计条（最新/涨跌/开/前收/高/低/额/换手）+ 分时曲线 */
export function GmtChartWidget() {
  const { selected } = useGmtDemo();
  const code = selected ? normalizeStockCode(selected.code) : "";

  const { data } = usePolling(
    async () => {
      if (!code) return null;
      const [minute, quotes] = await Promise.all([api.minute(code), api.quotes([code]).catch((): Record<string, Quote> => ({}))]);
      return { minute, q: quotes[code] ?? null };
    },
    POLL.SECTOR,
    [code]
  );

  const spark = useMemo(() => {
    const m = data?.minute;
    if (!m || m.points.length < 2) return null;
    return { points: m.points, prec: m.prec };
  }, [data]);

  if (!selected) {
    return (
      <div className="gmt-insp-empty flex h-full items-center justify-center px-4 text-center">
        在 01 热力图 / 10 资金流 点击个股，此处显示统计条与分时走势。
      </div>
    );
  }
  const q = data?.q;
  const chg = q ? q.change : (selected.price * selected.pct) / (100 + selected.pct);
  const pct = q?.pct ?? selected.pct;
  const price = q?.price ?? selected.price;

  return (
    <>
      <div className="gmt-stat-strip">
        <Stat l="标的" v={`${tileLabel(selected.code)} ${selected.name}`} cls="gmt-amber-text" />
        <Stat l="最新" v={fmtPrice(price)} cls={clsChg(pct)} />
        <Stat l="涨跌" v={`${chg > 0 ? "+" : ""}${chg.toFixed(2)}`} cls={clsChg(pct)} />
        <Stat l="涨跌幅" v={fmtPct(pct)} cls={clsChg(pct)} />
        <Stat l="开盘" v={q ? fmtPrice(q.open) : "—"} />
        <Stat l="前收" v={q ? fmtPrice(q.prev) : "—"} />
        <Stat l="最高" v={q ? fmtPrice(q.high) : "—"} cls={q ? clsChg(q.high - q.prev) : ""} />
        <Stat l="最低" v={q ? fmtPrice(q.low) : "—"} cls={q ? clsChg(q.low - q.prev) : ""} />
        <Stat l="成交额" v={q ? fmtWan(q.amount) : "—"} />
        <Stat l="换手" v={q && q.turnover ? `${q.turnover.toFixed(2)}%` : "—"} />
      </div>
      <div className="gmt-chart-readout">
        分时 · 09:30–15:00 · 虚线=昨收 {data?.minute?.degraded && <span style={{ color: "var(--gmt-amber)" }}>· 分时降级(上游限流)</span>}
      </div>
      <div className="gmt-chart-area">
        <Spark
          points={spark?.points ?? []}
          prec={spark?.prec ?? price}
          fluid
          width={600}
          height={200}
          session="ashare"
          emptyLabel={data?.minute?.degraded ? "分时暂不可用" : data ? "休市 / 无分时" : "加载中…"}
        />
      </div>
      <div className="gmt-chart-note">来源：腾讯行情 /api/minute · /api/quotes · 15s 刷新 · 点击 01 色块切换标的</div>
    </>
  );
}
