/**
 * /watch 独立自选页 — 只做选股与盯盘。
 * 不引入驾驶舱板块/快讯/美债/商品/AI/跑马灯等面板。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Star, Trash2 } from "lucide-react";
import { DashboardHeader } from "@/components/dash/DashboardHeader";
import { TabBar } from "@/components/dash/SharedUI";
import { useFullscreen } from "@/hooks/useFullscreen";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useStockSearch } from "@/hooks/useStockSearch";
import { useQuote } from "@/lib/market";
import { type StockSearchResult } from "@/lib/api";
import { pageLinks } from "@/lib/nav";
import { BRAND } from "@/config/branding";
import {
  normalizeWatchTicker,
  watchMarketLabel,
  type WatchMarket,
} from "@/lib/code";
import { TNUM, clsChg, bgChg, fmtPrice, fmtPct, fmtWan } from "@/lib/format";

const QUOTE_WAIT_MS = 6000;

type MarketFilter = "ALL" | WatchMarket;

function WatchQuoteRow({
  code,
  onRemove,
}: {
  code: string;
  onRemove: (code: string) => void;
}) {
  const q = useQuote(code);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setWaited(true), QUOTE_WAIT_MS);
    return () => clearTimeout(t);
  }, [code]);

  const hasPrice = q != null && Number.isFinite(q.price) && q.price > 0;
  const name = q?.name?.trim() || "";
  const market = watchMarketLabel(code);

  return (
    <tr className="border-b border-slate-800/80 text-[12px] hover:bg-slate-800/30">
      <td className="px-2 py-2">
        <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-400">{market || "—"}</span>
      </td>
      <td className="px-2 py-2 text-slate-100">{name || (waited ? "—" : "…")}</td>
      <td className="px-2 py-2 font-mono text-slate-400" style={TNUM}>{code}</td>
      <td className={`px-2 py-2 text-right font-semibold ${hasPrice ? clsChg(q.pct) : "text-slate-500"}`} style={TNUM}>
        {hasPrice ? fmtPrice(q.price) : waited ? "暂无报价" : "获取中…"}
      </td>
      <td className="px-2 py-2 text-right" style={TNUM}>
        {hasPrice ? (
          <span className={`rounded px-1 py-0.5 text-[11px] font-semibold ${bgChg(q.pct)}`}>{fmtPct(q.pct)}</span>
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </td>
      <td className="px-2 py-2 text-right text-slate-400" style={TNUM}>
        {hasPrice && q.amount && q.amount > 0 ? fmtWan(q.amount) : "—"}
      </td>
      <td className="px-2 py-2 text-right">
        <button
          type="button"
          onClick={() => onRemove(code)}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-rose-500/10 hover:text-rose-300"
          title="移除"
        >
          <Trash2 size={12} />
          移除
        </button>
      </td>
    </tr>
  );
}

export default function WatchDashboard() {
  const { isFullscreen, toggle } = useFullscreen();
  const { codes, addCode, removeCode } = useWatchlist();
  const [invalid, setInvalid] = useState(false);
  const [filter, setFilter] = useState<MarketFilter>("ALL");
  const suggestRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    input, setInput, triggerSearch,
    suggestions, showSuggest, setShowSuggest,
    highlightIdx, setHighlightIdx,
    clear, onKeyDown,
  } = useStockSearch();

  const visible = useMemo(() => {
    if (filter === "ALL") return codes;
    return codes.filter((c) => watchMarketLabel(c) === (filter === "HK" ? "港" : filter === "US" ? "美" : "A"));
  }, [codes, filter]);

  const add = (code?: string) => {
    const raw = code || normalizeWatchTicker(input);
    if (!addCode(raw)) { setInvalid(true); return; }
    setInvalid(false);
    clear();
  };

  const pickSuggestion = (s: StockSearchResult) => {
    add(s.code);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSuggest(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [setShowSuggest]);

  return (
    <div className="flex min-h-screen flex-col bg-[#070b12] text-slate-200">
      <DashboardHeader
        title="自选股"
        subtitle="STOCK WATCH"
        accent="cyan"
        tagline="搜索添加 · 实时报价 · 沪深港美 · 本地保存"
        linkTo="/"
        linkLabel={BRAND.homeNavLabel}
        linkBack
        links={pageLinks("/watch")}
        live
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggle}
      />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-3 px-4 py-4">
        <section className="rounded border border-slate-700/40 bg-[#0a101c] p-3">
          <div className="mb-2 flex items-center gap-2 text-[12px] text-slate-400">
            <Star size={14} className="text-amber-300" />
            <span>添加标的（A 股代码 / 港股 hk00700 / 美股 usAAPL，或名称、拼音）</span>
            <span className="ml-auto text-[10px] text-slate-500">{codes.length} 只 · 报价 5s</span>
          </div>
          <div className="relative flex gap-2">
            <input
              ref={inputRef}
              data-testid="watch-search"
              value={input}
              onChange={(e) => { setInput(e.target.value); setInvalid(false); triggerSearch(e.target.value); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !(showSuggest && (highlightIdx >= 0 || suggestions.length > 0))) {
                  e.preventDefault();
                  add();
                  return;
                }
                onKeyDown(e, pickSuggestion);
              }}
              onFocus={() => suggestions.length > 0 && setShowSuggest(true)}
              placeholder="代码/名称/拼音，如 600519 / 茅台 / hk00700 / usAAPL"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showSuggest}
              aria-controls="watch-page-suggest"
              aria-activedescendant={
                highlightIdx >= 0 && suggestions[highlightIdx]
                  ? `watch-page-opt-${suggestions[highlightIdx].code}`
                  : undefined
              }
              className={`min-w-0 flex-1 rounded border bg-slate-800/40 px-2 py-1.5 text-[13px] text-slate-200 outline-none placeholder:text-slate-600 ${
                invalid ? "border-rose-500/60" : "border-slate-700/50 focus:border-cyan-500/50"
              }`}
            />
            <button
              type="button"
              data-testid="watch-add"
              onClick={() => add()}
              className="shrink-0 rounded bg-cyan-500/20 px-3 py-1.5 text-[13px] text-cyan-200 hover:bg-cyan-500/30"
            >
              添加
            </button>
            {showSuggest && (
              <div
                ref={suggestRef}
                id="watch-page-suggest"
                role="listbox"
                aria-label="股票搜索建议"
                className="absolute left-0 right-16 top-full z-50 mt-0.5 max-h-64 overflow-y-auto rounded border border-slate-600/50 bg-slate-800 shadow-lg"
              >
                {suggestions.map((s, i) => (
                  <button
                    key={s.code}
                    id={`watch-page-opt-${s.code}`}
                    role="option"
                    aria-selected={i === highlightIdx}
                    onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                    onMouseEnter={() => setHighlightIdx(i)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] ${
                      i === highlightIdx ? "bg-cyan-500/20 text-cyan-100" : "text-slate-300 hover:bg-slate-700/50"
                    }`}
                  >
                    <span className="font-medium text-slate-100">{s.name}</span>
                    <span className="text-slate-500">{s.code}</span>
                    {s.pinyin && <span className="ml-auto text-slate-600">{s.pinyin}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          {invalid && (
            <p className="mt-1.5 text-[11px] text-rose-400">无法识别该代码。请输入沪深 6 位、港股 hk00700 或美股 usAAPL。</p>
          )}
        </section>

        <section className="flex min-h-0 flex-1 flex-col rounded border border-slate-700/40 bg-[#0a101c]">
          <div className="flex items-center justify-between border-b border-slate-700/40 px-3 py-2">
            <TabBar<MarketFilter>
              tabs={[
                { key: "ALL", label: "全部" },
                { key: "A", label: "A股" },
                { key: "HK", label: "港股" },
                { key: "US", label: "美股" },
              ]}
              active={filter}
              onChange={setFilter}
              accent="cyan"
            />
            <span className="text-[10px] text-slate-500">失败报价显示「暂无报价」，不编造价格</span>
          </div>
          {codes.length === 0 ? (
            <div data-testid="watch-empty" className="flex flex-1 items-center justify-center p-8 text-[13px] text-slate-500">
              列表为空，输入代码或名称添加自选股
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-8 text-[13px] text-slate-500">
              当前筛选下没有标的
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse" data-testid="watch-table">
                <thead>
                  <tr className="border-b border-slate-700/40 text-left text-[10px] text-slate-500">
                    <th className="px-2 py-2 font-medium">市场</th>
                    <th className="px-2 py-2 font-medium">名称</th>
                    <th className="px-2 py-2 font-medium">代码</th>
                    <th className="px-2 py-2 text-right font-medium">最新价</th>
                    <th className="px-2 py-2 text-right font-medium">涨跌幅</th>
                    <th className="px-2 py-2 text-right font-medium">成交额</th>
                    <th className="px-2 py-2 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((code) => (
                    <WatchQuoteRow key={code} code={code} onRemove={removeCode} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
