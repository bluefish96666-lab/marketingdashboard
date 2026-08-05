import { useEffect, useRef } from "react";
import { FileText } from "lucide-react";
import { Panel, type PanelZoomProps } from "../Panel";
import { useFinMain } from "./useFinData";
import { clsChg } from "@/lib/format";
import { useFin } from "./FinContext";
import { AsyncContent } from "../SharedUI";
import { TNUM, fmtYi, prefixCode, quarterLabel } from "./utils";
import { useStockSearch } from "@/hooks/useStockSearch";

/** 公司财报: 搜索框 + 最近查看 chips + 最新报告期指标卡 2×3 */
export function FinCompanyPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const { company, recent, select } = useFin();
  const { data, error, loading, retry } = useFinMain(company.code);

  const boxRef = useRef<HTMLDivElement>(null);
  const {
    input, triggerSearch,
    suggestions, showSuggest, setShowSuggest,
    onKeyDown,
  } = useStockSearch();

  // 点击外部关闭候选
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setShowSuggest(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [setShowSuggest]);

  const pickSuggestion = (s: { code: string; name: string }) => {
    select(prefixCode(s.code), s.name);
    setShowSuggest(false);
  };

  const r0 = data?.reports?.[0];
  const displayName = data?.name || company.name;

  return (
    <Panel
      className={className}
      {...zoomProps}
      title="公司财报"
      icon={<FileText size={14} />}
      accent="#22d3ee"
      right={<span className="max-w-[110px] truncate text-[10px] text-cyan-300">{displayName}</span>}
    >
      <div className="flex h-full min-h-0 flex-col gap-1 p-1.5">
        {/* 搜索框 */}
        <div ref={boxRef} className="relative shrink-0">
          <input
            value={input}
            onChange={(e) => triggerSearch(e.target.value)}
            onKeyDown={(e) => onKeyDown(e, pickSuggestion)}
            onFocus={() => suggestions.length > 0 && setShowSuggest(true)}
            placeholder="输入代码/名称"
            className="h-[24px] w-full rounded bg-slate-800/60 px-2 text-[11px] text-slate-200 placeholder:text-[9px] placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
          />
          {showSuggest && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-[26px] z-20 overflow-hidden rounded border border-slate-700/60 bg-[#0c1320] shadow-lg">
              {suggestions.map((s) => (
                <button
                  key={s.code}
                  onClick={() => pickSuggestion(s)}
                  className="flex h-[22px] w-full items-center gap-2 px-2 text-left hover:bg-slate-800/50"
                >
                  <span className="w-[62px] shrink-0 text-[9px] text-slate-500" style={TNUM}>
                    {s.code}
                  </span>
                  <span className="truncate text-[11px] text-slate-200">{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {/* 最近查看 chips: 单行 18px */}
        {recent.length > 0 && (
          <div className="flex h-[18px] shrink-0 flex-nowrap items-center gap-1 overflow-hidden">
            {recent.map((c) => (
              <button
                key={c.code}
                onClick={() => select(c.code, c.name)}
                className={`shrink-0 rounded border px-1.5 text-[9px] leading-[14px] ${
                  c.code === company.code
                    ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-300"
                    : "border-slate-700/60 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
        {/* 指标卡区: 3列×3行, 卡高 32px */}
        {!company.code ? (
          <div className="flex min-h-0 flex-1 items-center justify-center text-[11px] text-slate-600">
            ← 从榜单或搜索选入公司
          </div>
        ) : (
          <AsyncContent loading={loading} error={error} empty={!r0} emptyMessage="暂无财报数据" onRetry={retry} skeletonRows={6}>
            {data && r0 && (
          <>
            <div className="flex shrink-0 items-center justify-between px-0.5 text-[9px] text-slate-500">
              <span>
                报告期 <span className="text-slate-400">{quarterLabel(r0.date) || r0.label}</span>
              </span>
              <span>
                {data.name.length > 8 ? data.name.slice(0, 8) + "…" : data.name}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid grid-cols-3 content-start gap-1">
                <Card label="营收" value={fmtYi(r0.revenue)} sub={`${r0.revenueYoY > 0 ? "+" : ""}${r0.revenueYoY.toFixed(1)}%`} subCls={clsChg(r0.revenueYoY)} />
                <Card label="净利" value={fmtYi(r0.netProfit)} sub={`${r0.profitYoY > 0 ? "+" : ""}${r0.profitYoY.toFixed(1)}%`} subCls={clsChg(r0.profitYoY)} />
                <Card label="ROE" value={`${r0.roe.toFixed(1)}%`} />
                <Card label="EPS" value={r0.eps.toFixed(2)} />
                <Card label="毛利率" value={`${r0.grossMargin.toFixed(0)}%`} />
                <Card label="净利率" value={`${r0.netMargin.toFixed(0)}%`} />
                <Card label="资产负债率" value={`${r0.debtRatio.toFixed(1)}%`} />
                <Card label="ROIC" value={`${r0.roic.toFixed(1)}%`} />
                <Card label="每股OCF" value={r0.ocfPerShare.toFixed(2)} />
                <Card label="经营现金流" value={fmtYi(data.cash.operate)} />
                <Card label="自由现金流" value={fmtYi(data.cash.free)} />
                <Card label="应收账款" value={fmtYi(data.balance.accountsReceivable)} />
              </div>
              {/* 主营构成: 收入/利润贡献双条(cyan=收入占比, amber=利润占比) */}
              {data.mainop.length > 0 && (
                <>
                  <div className="flex items-center gap-2 px-0.5 pb-0.5 pt-1.5 text-[9px] font-medium uppercase tracking-widest text-slate-500">
                    主营构成
                    <span className="flex items-center gap-1 text-[8px] normal-case tracking-normal text-slate-600">
                      <span className="inline-block h-[3px] w-2 rounded bg-cyan-500/60" />收入
                      <span className="inline-block h-[3px] w-2 rounded bg-amber-500/60" />利润
                    </span>
                  </div>
                  <div className="flex flex-col">
                    {data.mainop.slice(0, 5).map((m) => (
                      <div key={m.name} className="flex h-[18px] items-center gap-1.5 px-0.5 text-[10px]">
                        <span className="w-[72px] shrink-0 truncate text-slate-300">{m.name}</span>
                        <span className="flex h-[8px] min-w-0 flex-1 items-center gap-[2px]">
                          <span className="h-[6px] rounded-sm bg-cyan-500/50" style={{ width: `${Math.min(100, m.incomeRatio * 100)}%` }} />
                          <span className="h-[6px] rounded-sm bg-amber-500/50" style={{ width: `${Math.min(100, m.profitRatio * 100)}%` }} />
                        </span>
                        <span className="w-[52px] shrink-0 text-right text-slate-400" style={TNUM}>{fmtYi(m.income)}</span>
                        <span className="w-[40px] shrink-0 text-right text-[9px] text-amber-400/80" style={TNUM}>{(m.profitRatio * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
          </AsyncContent>
        )}
      </div>
    </Panel>
  );
}

function Card({ label, value, sub, subCls }: { label: string; value: string; sub?: string; subCls?: string }) {
  return (
    <div className="flex h-[32px] min-w-0 flex-col justify-between rounded bg-slate-800/40 px-1.5 py-1">
      <div className="text-[9px] leading-[10px] text-slate-500">{label}</div>
      <div className="flex items-baseline justify-between gap-1">
        <span className="truncate text-[11px] font-semibold text-slate-200" style={TNUM}>
          {value}
        </span>
        {sub && (
          <span className={`shrink-0 text-[9px] ${subCls ?? "text-slate-500"}`} style={TNUM}>
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}
