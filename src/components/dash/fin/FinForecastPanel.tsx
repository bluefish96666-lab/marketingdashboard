import { useState } from "react";
import { Zap } from "lucide-react";
import { Panel, type PanelZoomProps } from "../Panel";
import { usePolling } from "@/hooks/usePolling";
import { api, type FinForecastItem } from "@/lib/api";
import { TNUM, fmtYi, forecastTone } from "./utils";
import { useFin } from "./FinContext";
import { AsyncContent, DataRow, RowName, ToneChip } from "../SharedUI";
import { clsChg, fmtPct } from "@/lib/format";
import { prefixCode } from "./utils";

/** 明细行: 固定列 日期 w40 | 名称 flex | chip w34 | 净利区间 w140 右对齐 | 同比 w120 右对齐, 行高 20px */
function Row({ it }: { it: FinForecastItem }) {
  const { select } = useFin();
  const tone = forecastTone(it.type);
  const mid = (it.yoyLow + it.yoyHigh) / 2;
  const yoyCls = clsChg(mid);
  return (
    <DataRow onClick={() => select(prefixCode(it.code), it.name)}>
      <span className="w-[40px] shrink-0 whitespace-nowrap text-[9px] text-slate-500" style={TNUM}>
        {it.date.slice(5)}
      </span>
      <RowName>{it.name}</RowName>
      <ToneChip tone={tone === "good" ? "rose" : tone === "bad" ? "emerald" : "slate"} dot={it.type === "首亏"}>
        {it.type}
      </ToneChip>
      <span className="w-[140px] shrink-0 truncate text-right text-[11px] text-slate-300" style={TNUM}>
        {fmtYi(it.profitLow)}~{fmtYi(it.profitHigh)}
      </span>
      <span className={`w-[120px] shrink-0 text-right text-[11px] ${yoyCls}`} style={TNUM}>
        {fmtPct(it.yoyLow, 1)}~{fmtPct(it.yoyHigh, 1)}
      </span>
    </DataRow>
  );
}

/** 业绩预告: 3px 贴头堆叠统计条(rose/emerald/slate) + 统计数字入标题栏 + 固定列紧凑表(公告日倒序) */
export function FinForecastPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const [retry, setRetry] = useState(0);
  const { period } = useFin();
  const { data, error, loading } = usePolling(() => api.financeForecast(period), 1800000, [retry, period]);

  const stats = data?.stats;
  const hasItems = (data?.items.length ?? 0) > 0;
  const total = stats ? stats.good + stats.bad + stats.neutral : 0;

  return (
    <Panel
      className={className}
      {...zoomProps}
      title="业绩预告"
      icon={<Zap size={14} />}
      accent="#fbbf24"
      right={
        stats &&
        hasItems && (
          <div className="flex items-center gap-2 text-[10px]" style={TNUM}>
            <span className="text-rose-400">预喜 {stats.good}▲</span>
            <span className="text-emerald-400">预悲 {stats.bad}▼</span>
            <span className="text-slate-500">未定 {stats.neutral}</span>
          </div>
        )
      }
    >
      <AsyncContent loading={loading} error={error} empty={!data || !hasItems} emptyMessage="当前非业绩预告密集披露期" onRetry={() => setRetry((r) => r + 1)}>
        {data && hasItems && <div className="flex h-full min-h-0 flex-col">
          {/* 3px 贴头堆叠条: 预喜 rose / 预悲 emerald / 未定 slate */}
          <div className="flex h-[3px] w-full shrink-0">
            {stats!.good > 0 && <div className="h-full bg-rose-400" style={{ width: `${(stats!.good / total) * 100}%` }} />}
            {stats!.bad > 0 && <div className="h-full bg-emerald-400" style={{ width: `${(stats!.bad / total) * 100}%` }} />}
            {stats!.neutral > 0 && (
              <div className="h-full bg-slate-600" style={{ width: `${(stats!.neutral / total) * 100}%` }} />
            )}
          </div>
          {/* 明细表 */}
          <div className="min-h-0 flex-1 overflow-y-auto py-0.5">
            {data.items.map((it) => (
              <Row key={`${it.date}-${it.code}`} it={it} />
            ))}
          </div>
        </div>}
      </AsyncContent>
    </Panel>
  );
}
