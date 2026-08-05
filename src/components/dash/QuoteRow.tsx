import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { usePolling } from "@/hooks/usePolling";
import { useQuote } from "@/lib/market";
import { api } from "@/lib/api";
import { Spark } from "./Spark";
import { bgChg, clsChg, fmtPct, fmtPrice, fmtYuan, TNUM } from "@/lib/format";
import { isTv } from "@/lib/tv";

/** 数据格: 9px 标签 + 11px 数值, flex 垂直居中(高度全行一致) */
function Stat({ label, value, valueCls = "text-slate-300" }: { label?: string; value: ReactNode; valueCls?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap leading-none">
      {label && <span className="shrink-0 text-[9px] text-slate-600">{label}</span>}
      <span className={`truncate text-[11px] ${valueCls}`} style={TNUM}>
        {value}
      </span>
    </div>
  );
}

/** 行宽小于该值时, 资金流标签收缩为单字(净/占) */
const COMPACT_WIDTH = 400;

interface QuoteRowProps {
  /** 腾讯格式代码, 如 sh688126; 商品/现货无代码时传空串跳过 MarketHub */
  code: string;
  name: string;
  price?: number;
  pct?: number;
  /** 名称旁徽标(产业链角色等) */
  tag?: string;
  /** 排名序号(1-3 名金色) */
  rank?: number;
  /** 成交额(已格式化文本) */
  amount?: string;
  /** 换手率(已格式化文本) */
  turnover?: string;
  /** 显示分时曲线(60s 轮询) — compact 模式下配合 sparkData 使用 */
  spark?: boolean;
  /** 显示所属行业/概念(5min 重试, 服务端 24h 缓存) */
  boards?: boolean;
  /** 显示主力净额/净占比(东财口径, 30s 轮询) */
  flow?: boolean;
  /** card = 带边框的卡片样式(产业链); compact = 单行商品行; index = 指数四列(徽标|名称+代码|分时/成交额|点位/涨幅) */
  variant?: "plain" | "card" | "compact" | "index";
  active?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  className?: string;
  /** 名称下方副文本 — compact 模式传入单位("元/吨"), 其他模式不传时显示 code */
  unit?: string;
  /** 外部 Spark 数据 — 传入则直接渲染, 跳过内部 minute 轮询 */
  sparkData?: {
    points: { t: string; p: number }[];
    prec: number;
    session?: "ashare" | "h24" | "daily";
  };
  /** 左侧彩色 accent 竖条(商品面板强调色) */
  accent?: string;
  /** 名称前短徽标(IndexPanel 传地区简写: CN/US/HK/FX) */
  badge?: string;
  /** 现期对照(基差)行: 品种 | 现货 | 期货 | 基差 | 基差率 — 仅 compact 模式使用 */
  basis?: { spot: number; futures: number; basis: number; basisPct: number };
  /** 附加财务列(财报列表): 每列上下两值, 与价/幅同一网格 — 仅 plain 模式使用 */
  extraCols?: { top?: ReactNode; bottom?: ReactNode; w: number }[];
  /** 前置列(财报预告的日期+趋势pill, 渲染在名称之前) — 仅 plain 模式使用 */
  leadingCols?: { top?: ReactNode; bottom?: ReactNode; w: number }[];
  /** 分时图同列附加内容(财报预告的净利/同比区间, 小字标签前置) — 仅 plain 模式使用 */
  sparkExtra?: ReactNode;
}

/** 统一个股行
 *  布局: [排名?] [名称+代码(跨2行)] [分时(跨2列)/主力净额·净占比] [成交额/换手率] [现价/涨跌幅] [删除?]
 *  底部整行: 标签 · 行业 · 概念
 */
export const QuoteRow = memo(function QuoteRow({
  code, name, price, pct, tag, rank, amount, turnover, spark, boards, flow, variant = "plain", active, onClick, onRemove,
  unit, sparkData, accent, badge, basis, className, extraCols, leadingCols, sparkExtra,
}: QuoteRowProps) {
  // 行宽自适应: 实测宽度决定资金流标签形态(主力净额/净占比 ↔ 净/占)
  // 仅 flow 模式需要; compact 模式无需
  const rootRef = useRef<HTMLElement | null>(null);
  const [rowWidth, setRowWidth] = useState(0);
  useEffect(() => {
    if (!flow) return;
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setRowWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [flow]);
  const compact = rowWidth > 0 && rowWidth < COMPACT_WIDTH;

  // 可见性联动轮询: 行在视口内才启动分时/板块/资金流轮询, 离开视口即停, 回到视口恢复
  // TV(老WebView+缩放渲染)IntersectionObserver 可能不触发, 导致行永不订阅、内容不更新;
  // TV 列表行数已收紧(15~40), 直接全部视为可见
  // compact 模式无内部轮询(sparkData 由外部提供), 无需 IO
  const needsVisible = (spark && !sparkData) || boards || flow;
  const [visible, setVisible] = useState(isTv || !needsVisible);
  useEffect(() => {
    if (isTv || !needsVisible) return;
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      setVisible(entries.some((e) => e.isIntersecting));
    });
    io.observe(el);
    return () => io.disconnect();
  }, [needsVisible]);

  // 统一报价中心: 价格/涨跌幅唯一来源(视口内才注册; props 仅作注册前的兜底)
  const hub = useQuote(code, visible);
  const p = hub?.price ?? price;
  const pc = hub?.pct ?? pct;

  const { data: minute } = usePolling(
    () => (spark && !sparkData && visible ? api.minute(code) : Promise.resolve(null)),
    60000,
    [code, spark, visible, !!sparkData],
    // 分时数据未变时复用旧引用, 避免 Spark 重算/重渲染
    (a, b) => JSON.stringify(a) === JSON.stringify(b)
  );
  // 服务端 24h 缓存, 前端 5 分钟重试以容忍上游瞬时失败
  const { data: bd } = usePolling(
    () => (boards && visible ? api.stockBoards(code) : Promise.resolve(null)),
    5 * 60 * 1000,
    [code, boards, visible]
  );
  const { data: fl } = usePolling(
    () => (flow && visible ? api.stockFlow(code) : Promise.resolve(null)),
    30000,
    [code, flow, visible]
  );

  // Spark 数据源: 外部 sparkData 优先, 其次内部 minute 轮询
  const sp = sparkData ?? (spark && minute ? { points: minute.points, prec: minute.prec } : null);

  const Tag = onClick ? "button" : "div";
  const skin =
    variant === "card"
      ? "border border-slate-700/25 bg-slate-800/15 hover:border-cyan-500/40 hover:bg-slate-800/30"
      : variant === "compact"
        ? ""
        : "hover:bg-slate-800/40 hover:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.22)]";

  const ratioBar = fl ? Math.min(100, Math.abs(fl.netRatio) * 2) : 0;
  const subtitle = unit ?? code;

  // ---- compact 单行布局(商品/现货) ----
  if (variant === "compact") {
    // 现期对照(基差): 名称 | spark 图 | 右侧两列数据(现货/期货 + 基差/基差率, 每列上下两值)
    if (basis) {
      return (
        <Tag
          ref={(el: HTMLElement | null) => { rootRef.current = el; }}
          onClick={onClick}
          className={`group grid w-full grid-cols-[72px_minmax(0,1fr)_110px_110px] grid-rows-[20px_16px] items-center gap-x-1 rounded px-2 py-[4px] text-left transition-colors hover:bg-slate-800/40 hover:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.22)] ${active ? "bg-cyan-500/10 ring-1 ring-cyan-500/40" : ""} ${className || ""}`}
        >
          {/* 名称+单位, 跨2行 */}
          <div className="row-span-2 flex min-w-0 flex-col justify-center gap-1 leading-none">
            <span className="truncate text-[11px] text-slate-200">{name}</span>
            <span className="truncate text-[10px] text-slate-500">{subtitle}</span>
          </div>
          {/* 分时图: 跨2行, 垂直居中 */}
          <div className="row-span-2 flex h-full min-w-0 items-center">
            {sp && sp.points.length > 1 && (
              <Spark points={sp.points} prec={sp.prec} width={160} height={20} fluid session={sparkData?.session || "daily"} />
            )}
          </div>
          {/* 列3: 现货(上) | 期货(下) */}
          <span className="col-start-3 row-start-1 flex min-w-0 items-center gap-1 leading-none">
            <span className="shrink-0 text-[9px] text-slate-600">现货</span>
            <span className="truncate text-[11px] font-semibold text-slate-200" style={TNUM}>{fmtPrice(basis.spot)}</span>
          </span>
          <span className="col-start-3 row-start-2 flex min-w-0 items-center gap-1 leading-none">
            <span className="shrink-0 text-[9px] text-slate-600">期货</span>
            <span className="truncate text-[11px] text-slate-400" style={TNUM}>{fmtPrice(basis.futures)}</span>
          </span>
          {/* 列4: 基差(上) | 基差率(下) */}
          <span className="col-start-4 row-start-1 flex min-w-0 items-center gap-1 leading-none">
            <span className="shrink-0 text-[9px] text-slate-600">基差</span>
            <span className={`truncate text-[11px] font-semibold ${clsChg(basis.basis)}`} style={TNUM}>{basis.basis > 0 ? "+" : ""}{fmtPrice(basis.basis)}</span>
          </span>
          <span className="col-start-4 row-start-2 flex min-w-0 items-center gap-1 leading-none">
            <span className="shrink-0 text-[9px] text-slate-600">基差率</span>
            <span className={`rounded px-0.5 text-[11px] font-semibold ${bgChg(basis.basisPct)}`} style={TNUM}>{fmtPct(basis.basisPct)}</span>
          </span>
        </Tag>
      );
    }
    return (
      <Tag
        ref={(el: HTMLElement | null) => { rootRef.current = el; }}
        onClick={onClick}
        className={`group flex items-center gap-1.5 w-full rounded px-1 py-[3px] text-left transition-colors hover:bg-slate-800/40 hover:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.22)] ${accent ? "relative" : ""} ${
          active ? "bg-cyan-500/10 ring-1 ring-cyan-500/40" : ""
        } ${className || ""}`}
      >
        {accent && (
          <span aria-hidden className="absolute left-0 top-0 h-full w-[3px] rounded-l" style={{ background: accent, opacity: 0.55 }} />
        )}
        {badge && (
          <span className="w-6 shrink-0 rounded-sm bg-slate-700/50 text-center text-[8px] leading-3 text-slate-400">{badge}</span>
        )}
          <div className="w-[72px] shrink-0 leading-none">
            <div className="truncate text-[11px] text-slate-300">{name}</div>
            {subtitle && <div className="mt-0.5 truncate text-[8px] text-slate-600">{subtitle}</div>}
          </div>
          <span className={`w-[72px] shrink-0 text-right text-[11px] font-semibold ${pct != null ? clsChg(pct) : "text-slate-400"}`} style={TNUM}>
            {p != null ? fmtPrice(p) : "—"}
          </span>
          <span className={`w-[52px] shrink-0 rounded px-0.5 text-right text-[10px] font-semibold ${pct != null ? bgChg(pct) : ""}`} style={TNUM}>
            {pct != null ? fmtPct(pct) : ""}
          </span>
          <span className="min-w-0 flex-1">
            {sp && sp.points.length > 1 ? (
              <Spark points={sp.points} prec={sp.prec} width={120} height={20} fluid emptyLabel="—" session={sparkData?.session || "ashare"} />
            ) : (
              <span className="text-[10px] text-slate-600">——</span>
            )}
          </span>
      </Tag>
    );
  }

  // ---- index 布局(全球指数): 徽标 | 名称+代码 | mini分时/成交额 | 点位/涨幅 ----
  if (variant === "index") {
    return (
      <Tag
        ref={(el: HTMLElement | null) => {
          rootRef.current = el;
        }}
        onClick={onClick}
        className={`group block w-full rounded px-1.5 py-[2px] text-left transition-colors hover:bg-slate-800/40 hover:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.22)] ${
          active ? "bg-cyan-500/10 ring-1 ring-cyan-500/40" : ""
        } ${className || ""}`}
      >
        <div
          className="grid items-center gap-x-1.5"
          style={{
            gridTemplateColumns: "auto 72px minmax(0,1fr) 70px",
            gridTemplateRows: "16px 14px",
          }}
        >
          {/* 地区徽标, 跨2行 */}
          {badge && (
            <div className="row-span-2 self-center">
              <span className="w-6 shrink-0 rounded-sm bg-slate-700/50 text-center text-[8px] leading-3 text-slate-400">{badge}</span>
            </div>
          )}
          {/* 指数名称+代码, 跨2行 */}
          <div className="row-span-2 flex min-w-0 flex-col justify-center gap-1 leading-none">
            <span className="truncate text-[11px] text-slate-200">{name}</span>
            <span className="truncate text-[9px] text-slate-500">{subtitle}</span>
          </div>
          {/* mini 分时图 */}
          <div className="flex h-[16px] min-w-0 items-center self-center">
            {sp && sp.points.length > 1 ? (
              <Spark points={sp.points} prec={sp.prec} width={120} height={16} fluid emptyLabel="—" session={sparkData?.session || "ashare"} />
            ) : (
              <span className="text-[10px] text-slate-600">——</span>
            )}
          </div>
          {/* 指数点位 */}
          <span className={`self-center text-right text-[12px] font-bold leading-none ${p != null ? clsChg(p) : "text-slate-600"}`} style={TNUM}>
            {p != null ? fmtPrice(p) : "—"}
          </span>
          {/* 成交额 */}
          <span className="self-center truncate text-right text-[9px] leading-none text-slate-500" style={TNUM}>
            {amount || "—"}
          </span>
          {/* 涨幅 */}
          <span className={`self-center justify-self-end rounded px-0.5 text-[10px] font-semibold leading-none ${pc != null ? bgChg(pc) : ""}`} style={TNUM}>
            {pc != null ? fmtPct(pc) : ""}
          </span>
        </div>
      </Tag>
    );
  }

  // ---- 财报行(plain + extraCols): 名称+代码 | 分时 | 价/幅 | 财务列(上下两值) ----
  if (variant === "plain" && (extraCols?.length || leadingCols?.length || sparkExtra)) {
    const prefix = (rank != null ? "auto " : "") + (badge ? "auto " : "");
    const lead = leadingCols ? leadingCols.map((c) => `${c.w}px`).join(" ") + " " : "";
    const cols = `${prefix}${lead}72px minmax(0,1fr) 60px ${extraCols ? extraCols.map((c) => `${c.w}px`).join(" ") : ""}${onRemove ? " auto" : ""}`;
    return (
      <Tag
        ref={(el: HTMLElement | null) => { rootRef.current = el; }}
        onClick={onClick}
        className={`group block w-full rounded px-2 py-[4px] text-left transition-colors hover:bg-slate-800/40 hover:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.22)] ${active ? "bg-cyan-500/10 ring-1 ring-cyan-500/40" : ""} ${className || ""}`}
      >
        {accent && (
          <span aria-hidden className="absolute left-0 top-0 h-full w-[3px] rounded-l" style={{ background: accent, opacity: 0.55 }} />
        )}
        <div className="grid items-center gap-x-1" style={{ gridTemplateColumns: cols, gridTemplateRows: "20px 16px" }}>
          {rank != null && (
            <div className="row-span-2 self-center text-[11px] font-bold leading-none" style={{ color: rank <= 3 ? ["#fbbf24", "#fb7185", "#22d3ee"][rank - 1] : "#64748b", ...TNUM }}>
              {rank}
            </div>
          )}
          {badge && (
            <div className="row-span-2 self-center">
              <span className="w-6 shrink-0 rounded-sm bg-slate-700/50 text-center text-[8px] leading-3 text-slate-400">{badge}</span>
            </div>
          )}
          {/* 前置列(第一行上值, 第二行下值) */}
          {leadingCols?.map((c, i) => (
            <div key={i} className="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap leading-none">
              {c.top ?? <span />}
            </div>
          ))}
          {/* 名称+代码, 跨2行 */}
          <div className="row-span-2 flex min-w-0 flex-col justify-center gap-1 leading-none">
            <span className="truncate text-[11px] text-slate-200">{name}</span>
            <span className="text-[10px] text-slate-500">{subtitle}</span>
          </div>
          {/* 第一行: 分时 + 现价 + 财务列上值 */}
          <div className="flex h-[20px] min-w-0 items-center self-center">
            {sp && sp.points.length > 1 ? (
              <Spark points={sp.points} prec={sp.prec} width={160} height={20} fluid emptyLabel="—" session={sparkData?.session || "ashare"} />
            ) : (
              <span className="text-[10px] text-slate-600">——</span>
            )}
          </div>
          <Stat label="价" value={p != null ? fmtPrice(p) : "—"} valueCls={`font-semibold ${p != null ? clsChg(p) : "text-slate-600"}`} />
          {extraCols?.map((c, i) => (
            <div key={i} className="flex min-w-0 items-center justify-end gap-1 overflow-hidden whitespace-nowrap leading-none">
              {c.top ?? <span />}
            </div>
          ))}
          {/* 前置列下值 */}
          {leadingCols?.map((c, i) => (
            <div key={i} className="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap leading-none">
              {c.bottom ?? <span />}
            </div>
          ))}
          {/* 第二行: 分时同列附加(净利/同比区间) + 涨幅 + 财务列下值; 组间两端对齐 */}
          <div className="flex h-[16px] min-w-0 items-center justify-between gap-1.5 self-center">{sparkExtra}</div>
          <Stat label="幅" value={pc != null ? fmtPct(pc, 2) : ""} valueCls={`font-semibold ${pc != null ? clsChg(pc) : "text-slate-600"}`} />
          {extraCols?.map((c, i) => (
            <div key={i} className="flex min-w-0 items-center justify-end gap-1 overflow-hidden whitespace-nowrap leading-none">
              {c.bottom ?? <span />}
            </div>
          ))}
          {onRemove && (
            <div className="row-span-2 self-center">
              <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="text-[10px] leading-none text-slate-600 opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100" title="移除">×</button>
            </div>
          )}
        </div>
      </Tag>
    );
  }

  // ---- plain / card 双行 Grid 布局(个股) ----
  const hasFlow = Boolean(flow);
  const hasAmount = Boolean(amount);
  const hasTurnover = Boolean(turnover);
  const nameW = variant === "card" ? "56px" : "72px";

  // 动态网格: flow 有/无 对应不同列模板
  let gridCols: string;
  let sparkColSpan: number;
  const prefix = (rank != null ? "auto " : "") + (badge ? "auto " : "");
  const suffix = onRemove ? " auto" : "";

  if (hasFlow) {
    gridCols = `${prefix}${nameW} minmax(0,1fr) minmax(0,1fr) ${hasAmount ? "64px" : "0px"} ${variant === "card" ? "54px" : "60px"}${suffix}`;
    sparkColSpan = 2;
  } else if (hasAmount || hasTurnover) {
    gridCols = `${prefix}${nameW} minmax(0,1fr) 64px ${variant === "card" ? "54px" : "60px"}${suffix}`;
    sparkColSpan = 1;
  } else {
    // 商品/最小模式: 名称 | spark(跨3列填满) | 价格 | 涨跌幅
    gridCols = `${prefix}${nameW} minmax(0,1fr) 72px 52px${suffix}`;
    sparkColSpan = 3;
  }

  return (
    <Tag
      ref={(el: HTMLElement | null) => {
        rootRef.current = el;
      }}
      onClick={onClick}
      className={`group block w-full rounded px-2 py-[4px] text-left transition-colors ${skin} ${
        accent ? "relative" : ""
      } ${active ? "bg-cyan-500/10 ring-1 ring-cyan-500/40" : ""}`}
    >
      {accent && (
        <span aria-hidden className="absolute left-0 top-0 h-full w-[3px] rounded-l" style={{ background: accent, opacity: 0.55 }} />
      )}
      <div
        className="grid items-center gap-x-1"
        style={{
          gridTemplateColumns: gridCols,
          // 固定两行高: 分时区恒占 20px, 数据区 16px, 各行一致
          gridTemplateRows: "20px 16px",
        }}
      >
        {/* 首列: 排名序号, 跨2行 */}
        {rank != null && (
          <div
            className={`row-span-2 self-center text-[11px] font-bold leading-none ${rank <= 3 ? "text-amber-400" : "text-slate-600"}`}
            style={TNUM}
          >
            {rank}
          </div>
        )}
        {/* 地区徽标(IndexPanel) */}
        {badge && (
          <div className="row-span-2 self-center">
            <span className="w-6 shrink-0 rounded-sm bg-slate-700/50 text-center text-[8px] leading-3 text-slate-400">{badge}</span>
          </div>
        )}
        {/* 左格: 名称+代码, 跨2行 */}
        <div className="row-span-2 flex min-w-0 flex-col justify-center gap-1 leading-none">
          <span className="truncate text-[11px] text-slate-200">{name}</span>
          <span className="text-[10px] text-slate-500">{subtitle}</span>
        </div>

        {/* 第一行: 分时图(跨 sparkColSpan 列, 恒占 20px 高度) */}
        <div className={`flex h-[20px] min-w-0 items-center self-center`} style={{ gridColumn: `span ${sparkColSpan}` }}>
          {sp && sp.points.length > 1 ? (
            <Spark points={sp.points} prec={sp.prec} width={160} height={20} fluid emptyLabel="—" session={sparkData?.session || "ashare"} />
          ) : (
            <span className="text-[10px] text-slate-600">——</span>
          )}
        </div>
        {/* 第一行: 成交额 / 现价(仅 flow 或 amount 模式) */}
        {hasFlow || hasAmount ? (
          hasAmount ? <Stat label="额" value={amount} /> : <div />
        ) : null}
        {hasFlow || hasAmount || hasTurnover ? (
          <Stat label="价" value={p != null ? fmtPrice(p) : "—"} />
        ) : null}
        {/* 末列: 删除按钮, 跨2行 */}
        {onRemove && (
          <div className="row-span-2 self-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="text-[10px] leading-none text-slate-600 opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
              title="移除"
            >
              ×
            </button>
          </div>
        )}

        {/* 第二行: 按模式渲染不同列 */}
        {hasFlow ? (
          <>
            <Stat label={compact ? "净" : "主力净额"} value={fl ? fmtYuan(fl.netIn) : "—"} valueCls={`font-semibold ${fl ? clsChg(fl.netIn) : "text-slate-600"}`} />
            <div className="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap leading-none">
              <span className="shrink-0 text-[9px] text-slate-600">{compact ? "占" : "净占比"}</span>
              <span className="h-1 min-w-0 flex-1 self-center rounded-full bg-slate-800">
                <span className={`block h-1 rounded-full ${fl && fl.netRatio < 0 ? "bg-emerald-400/80" : "bg-rose-400/80"}`} style={{ width: `${ratioBar}%` }} />
              </span>
              <span className={`truncate text-[11px] ${fl ? clsChg(fl.netRatio) : "text-slate-600"}`} style={TNUM}>{fl ? `${fl.netRatio.toFixed(1)}%` : "—"}</span>
            </div>
            {hasTurnover ? <Stat label="换" value={turnover} /> : <div />}
            <Stat label="幅" value={pc != null ? fmtPct(pc, variant === "card" ? 1 : 2) : ""} valueCls={`font-semibold ${pc != null ? clsChg(pc) : "text-slate-600"}`} />
          </>
        ) : hasAmount || hasTurnover ? (
          <>
            <div />
            {hasTurnover ? <Stat label="换" value={turnover} /> : <div />}
            <Stat label="幅" value={pc != null ? fmtPct(pc, variant === "card" ? 1 : 2) : ""} valueCls={`font-semibold ${pc != null ? clsChg(pc) : "text-slate-600"}`} />
          </>
        ) : (
          <>
            <div />
            <Stat label="价" value={p != null ? fmtPrice(p) : "—"} />
            <Stat label="幅" value={pc != null ? fmtPct(pc, 1) : ""} valueCls={`font-semibold ${pc != null ? clsChg(pc) : "text-slate-600"}`} />
          </>
        )}
      </div>

      {/* 底部整行: 标签 · 行业 · 概念(boards 开启时恒占一行) */}
      {(tag || boards) && (
        <div className="mt-0.5 flex h-[13px] min-w-0 items-center gap-1.5 text-[9px] leading-none">
          {tag && (
            <span className="shrink-0 rounded-sm bg-slate-700/40 px-1 py-px text-[8px] text-slate-400">{tag}</span>
          )}
          {boards && bd && (bd.industry || (bd.concepts?.length ?? 0) > 0) && (
            <span className="truncate">
              {bd.industry && <span className="text-cyan-500/80">{bd.industry}</span>}
              {(bd.concepts?.length ?? 0) > 0 && (
                <span className="text-slate-600">
                  {bd.industry ? " · " : ""}
                  {(bd.concepts ?? []).join("/")}
                </span>
              )}
            </span>
          )}
        </div>
      )}
    </Tag>
  );
});
