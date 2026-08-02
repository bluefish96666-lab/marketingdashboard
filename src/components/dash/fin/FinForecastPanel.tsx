import { useState } from "react";
import { Panel, type PanelZoomProps } from "../Panel";
import { usePolling } from "@/hooks/usePolling";
import { api, type FinForecastItem } from "@/lib/api";
import { TNUM, fmtYi, forecastTone } from "./utils";
import { useFin } from "./FinContext";
import { prefixCode } from "./utils";

const CHIP_CLS = {
  good: "border-rose-400/60 bg-rose-400/10 text-rose-300",
  bad: "border-emerald-400/60 bg-emerald-400/10 text-emerald-300",
  neutral: "border-slate-500/60 bg-slate-500/10 text-slate-400",
} as const;

function Row({ it }: { it: FinForecastItem }) {
  const { select } = useFin();
  const tone = forecastTone(it.type);
  const mid = (it.yoyLow + it.yoyHigh) / 2;
  const yoyCls = mid > 0 ? "text-rose-400" : mid < 0 ? "text-emerald-400" : "text-slate-400";
  return (
    <button
      onClick={() => select(prefixCode(it.code), it.name)}
      className="flex h-[20px] w-full items-center gap-1.5 border-b border-slate-800/60 px-2.5 text-left hover:bg-slate-800/30"
    >
      <span className="w-[32px] shrink-0 whitespace-nowrap text-[9px] text-slate-500" style={TNUM}>
        {it.date.slice(5)}
      </span>
      <span className="w-[64px] shrink-0 truncate text-[11px] text-slate-200">{it.name}</span>
      <span className={`flex shrink-0 items-center gap-0.5 rounded border px-1 text-[8.5px] leading-[13px] ${CHIP_CLS[tone]}`}>
        {it.type === "首亏" && <span className="inline-block h-[3px] w-[3px] rounded-full bg-amber-400" />}
        {it.type}
      </span>
      <span className="min-w-0 flex-1 truncate text-right text-[11px] text-slate-300" style={TNUM}>
        净利 {fmtYi(it.profitLow)}~{fmtYi(it.profitHigh)}
      </span>
      <span className={`w-[86px] shrink-0 text-right text-[10px] ${yoyCls}`} style={TNUM}>
        {it.yoyLow > 0 ? "+" : ""}
        {it.yoyLow.toFixed(1)}%~{it.yoyHigh > 0 ? "+" : ""}
        {it.yoyHigh.toFixed(1)}%
      </span>
    </button>
  );
}

/** 业绩预告: 顶部预喜/预悲堆叠统计条 + 明细表(公告日倒序) */
export function FinForecastPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const [retry, setRetry] = useState(0);
  const { period } = useFin();
  const { data, error, loading } = usePolling(() => api.financeForecast(period), 1800000, [retry, period]);

  const stats = data?.stats;
  const total = stats ? stats.good + stats.bad + stats.neutral : 0;

  return (
    <Panel className={className} {...zoomProps} title="业绩预告" icon="⚡" accent="#fbbf24">
      {!data ? (
        <div className="flex h-full items-center justify-center text-[11px]">
          {loading ? (
            <span className="text-slate-600">数据加载中…</span>
          ) : (
            <button className="h-full w-full text-slate-500" onClick={() => setRetry((r) => r + 1)}>
              数据获取失败，点击重试{error ? `(${error})` : ""}
            </button>
          )}
        </div>
      ) : data.items.length === 0 ? (
        <div className="flex h-full items-center justify-center text-[11px] text-slate-600">当前非业绩预告密集披露期</div>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          {/* 统计条区 22px */}
          <div className="shrink-0 px-2.5 pt-1.5">
            <div className="flex h-[4px] w-full overflow-hidden rounded-full bg-slate-800/60">
              {stats!.good > 0 && (
                <div
                  className="h-full bg-gradient-to-r from-rose-400 to-rose-500"
                  style={{ width: `${(stats!.good / total) * 100}%` }}
                />
              )}
              {stats!.bad > 0 && (
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                  style={{ width: `${(stats!.bad / total) * 100}%` }}
                />
              )}
            </div>
            <div className="flex items-center gap-3 pt-1 text-[10px]" style={TNUM}>
              <span className="text-rose-400">预喜 {stats!.good} ▲</span>
              <span className="text-emerald-400">预悲 {stats!.bad} ▼</span>
              <span className="text-slate-500">不确定 {stats!.neutral}</span>
            </div>
          </div>
          {/* 明细表 */}
          <div className="min-h-0 flex-1 overflow-y-auto py-0.5">
            {data.items.map((it) => (
              <Row key={`${it.date}-${it.code}`} it={it} />
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
