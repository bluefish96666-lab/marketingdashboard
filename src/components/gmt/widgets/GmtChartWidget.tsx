import { useEffect, useMemo, useState } from "react";
import { usePolling } from "@/hooks/usePolling";
import { api, type Quote } from "@/lib/api";
import { normalizeStockCode } from "@/lib/code";
import { clsChg, fmtPct, fmtPrice, fmtWan } from "@/lib/format";
import { POLL } from "@/lib/intervals";
import { Spark } from "@/components/dash/Spark";
import { tileLabel } from "@/components/dash/heatmap/heatmap-shared";
import { useGmtDemo } from "../gmt-context";

type ChartMode = "minute" | "daily";

function Stat({ l, v, cls = "" }: { l: string; v: string; cls?: string }) {
  return (
    <div className="gmt-stat">
      <div className="sl">{l}</div>
      <div className={`sv ${cls}`}>{v}</div>
    </div>
  );
}

/** 04 — 选中标的：统计条 + 分时 / 近 60 日K（对齐 Kimi「近 60 个交易日」） */
export function GmtChartWidget() {
  const { selected, setWidgetTitle, reportSource } = useGmtDemo();
  const code = selected ? normalizeStockCode(selected.code) : "";
  const [mode, setMode] = useState<ChartMode>("daily");

  const { data: minutePack } = usePolling(
    async () => {
      if (!code || mode !== "minute") return null;
      const [minute, quotes] = await Promise.all([
        api.minute(code),
        api.quotes([code]).catch((): Record<string, Quote> => ({})),
      ]);
      return { minute, q: quotes[code] ?? null };
    },
    POLL.SECTOR,
    [code, mode]
  );

  const { data: dailyPack, error: dailyErr } = usePolling(
    async () => {
      if (!code || mode !== "daily") return null;
      if (!/^(sh|sz|bj)\d{6}$/i.test(code)) {
        return { unsupported: true as const, daily: null, q: null };
      }
      const [daily, quotes] = await Promise.all([
        api.kline(code, 60, 1),
        api.quotes([code]).catch((): Record<string, Quote> => ({})),
      ]);
      return { unsupported: false as const, daily, q: quotes[code] ?? null };
    },
    300_000,
    [code, mode]
  );

  useEffect(() => {
    if (!selected) {
      setWidgetTitle("chart", null);
      return;
    }
    const sym = tileLabel(selected.code);
    if (mode === "daily") {
      const n = dailyPack?.daily?.points.length ?? 60;
      setWidgetTitle("chart", `${sym} · 近 ${n} 个交易日`);
    } else {
      setWidgetTitle("chart", `${sym} · 分时`);
    }
    return () => setWidgetTitle("chart", null);
  }, [selected, mode, dailyPack?.daily?.points.length, setWidgetTitle]);

  useEffect(() => {
    if (mode === "daily" && dailyPack?.daily) {
      reportSource("kline", "个股日K · /api/kline", true, dailyPack.daily.points.length);
    } else if (mode === "daily" && dailyErr) {
      reportSource("kline", "个股日K · /api/kline", false, 0);
    }
  }, [mode, dailyPack, dailyErr, reportSource]);

  const minuteSpark = useMemo(() => {
    const m = minutePack?.minute;
    if (!m || m.points.length < 2) return null;
    return { points: m.points, prec: m.prec };
  }, [minutePack]);

  const dailySpark = useMemo(() => {
    const pts = dailyPack?.daily?.points;
    if (!pts || pts.length < 2) return null;
    return {
      points: pts.map((p) => ({ t: p.t, p: p.c })),
      prec: pts[0].c,
    };
  }, [dailyPack]);

  if (!selected) {
    return (
      <div className="gmt-insp-empty flex h-full items-center justify-center px-4 text-center">
        在 01 热力图 / 10 资金流 点击个股，此处显示统计条与分时 / 日K。
      </div>
    );
  }

  const q = mode === "minute" ? minutePack?.q : dailyPack?.q;
  const lastDaily = dailyPack?.daily?.points.at(-1);
  const firstDaily = dailyPack?.daily?.points[0];
  const price = q?.price ?? lastDaily?.c ?? selected.price;
  const pct =
    q?.pct ??
    (firstDaily && lastDaily && firstDaily.c
      ? ((lastDaily.c - firstDaily.c) / firstDaily.c) * 100
      : selected.pct);
  const chg = q ? q.change : (price * pct) / (100 + pct);

  return (
    <>
      <div className="gmt-stat-strip">
        <Stat l="标的" v={`${tileLabel(selected.code)} ${selected.name}`} cls="gmt-amber-text" />
        <Stat l="最新" v={fmtPrice(price)} cls={clsChg(pct)} />
        <Stat l="涨跌" v={`${chg > 0 ? "+" : ""}${chg.toFixed(2)}`} cls={clsChg(pct)} />
        <Stat l="涨跌幅" v={fmtPct(pct)} cls={clsChg(pct)} />
        <Stat l="开盘" v={q ? fmtPrice(q.open) : lastDaily ? fmtPrice(lastDaily.o) : "—"} />
        <Stat l="前收" v={q ? fmtPrice(q.prev) : firstDaily ? fmtPrice(firstDaily.c) : "—"} />
        <Stat
          l="最高"
          v={q ? fmtPrice(q.high) : lastDaily ? fmtPrice(lastDaily.h) : "—"}
          cls={q ? clsChg(q.high - q.prev) : ""}
        />
        <Stat
          l="最低"
          v={q ? fmtPrice(q.low) : lastDaily ? fmtPrice(lastDaily.l) : "—"}
          cls={q ? clsChg(q.low - q.prev) : ""}
        />
        <Stat l="成交额" v={q ? fmtWan(q.amount) : "—"} />
        <Stat l="换手" v={q && q.turnover ? `${q.turnover.toFixed(2)}%` : "—"} />
      </div>

      <div className="gmt-chart-readout" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className="gmt-mode-tabs" role="tablist" aria-label="图表周期">
          <button type="button" className={mode === "daily" ? "on" : ""} onClick={() => setMode("daily")}>
            日K·60
          </button>
          <button type="button" className={mode === "minute" ? "on" : ""} onClick={() => setMode("minute")}>
            分时
          </button>
        </span>
        {mode === "daily" ? (
          <span>
            日K · 近 {dailyPack?.daily?.points.length ?? 60} 个交易日 · 前复权
            {dailyPack?.unsupported && <span style={{ color: "var(--gmt-amber)" }}> · 仅支持 A 股</span>}
            {dailyErr && <span style={{ color: "var(--gmt-amber)" }}> · 日K暂不可用</span>}
          </span>
        ) : (
          <span>
            分时 · 09:30–15:00 · 虚线=昨收
            {minutePack?.minute?.degraded && (
              <span style={{ color: "var(--gmt-amber)" }}> · 分时降级(上游限流)</span>
            )}
          </span>
        )}
      </div>

      <div className="gmt-chart-area">
        {mode === "daily" ? (
          <Spark
            points={dailySpark?.points ?? []}
            prec={dailySpark?.prec ?? price}
            fluid
            width={600}
            height={200}
            session="daily"
            emptyLabel={
              dailyPack?.unsupported ? "日K仅支持 A 股" : dailyErr ? "日K暂不可用" : dailyPack ? "无日K" : "加载日K…"
            }
          />
        ) : (
          <Spark
            points={minuteSpark?.points ?? []}
            prec={minuteSpark?.prec ?? price}
            fluid
            width={600}
            height={200}
            session="ashare"
            emptyLabel={
              minutePack?.minute?.degraded ? "分时暂不可用" : minutePack ? "休市 / 无分时" : "加载中…"
            }
          />
        )}
      </div>
      <div className="gmt-chart-note">
        {mode === "daily"
          ? "来源：东财 /api/kline · 5 分钟缓存 · 点击 01 色块切换标的"
          : "来源：腾讯行情 /api/minute · /api/quotes · 15s 刷新 · 点击 01 色块切换标的"}
      </div>
    </>
  );
}
