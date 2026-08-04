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
  /** card = 带边框的卡片样式(产业链); compact = 单行商品行 */
  variant?: "plain" | "card" | "compact";
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
}

/** 统一个股行
 *  布局: [排名?] [名称+代码(跨2行)] [分时(跨2列)/主力净额·净占比] [成交额/换手率] [现价/涨跌幅] [删除?]
 *  底部整行: 标签 · 行业 · 概念
 */
export const QuoteRow = memo(function QuoteRow({
  code, name, price, pct, tag, rank, amount, turnover, spark, boards, flow, variant = "plain", active, onClick, onRemove,
  unit, sparkData, accent, className,
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
    return (
      <Tag
        ref={(el: HTMLElement | null) => { rootRef.current = el; }}
        onClick={onClick}
        className={`group flex items-center gap-1.5 w-full rounded px-1 py-[3px] text-left transition-colors hover:bg-slate-800/40 ${accent ? "relative" : ""} ${
          active ? "bg-cyan-500/10 ring-1 ring-cyan-500/40" : ""
        } ${className || ""}`}
      >
        {accent && (
          <span aria-hidden className="absolute left-0 top-0 h-full w-[3px] rounded-l" style={{ background: accent, opacity: 0.55 }} />
        )}
          <div className="w-[72px] shrink-0 leading-none">
            <div className="truncate text-[11px] text-slate-300">{name}</div>
            {subtitle && <div className="mt-0.5 truncate text-[8px] text-slate-600">{subtitle}</div>}
          </div>
          <span className={`w-[72px] shrink-0 text-right text-[12px] font-semibold ${pct != null ? clsChg(pct) : "text-slate-400"}`} style={TNUM}>
            {p != null ? fmtPrice(p) : "—"}
          </span>
          <span className={`w-[52px] shrink-0 rounded px-0.5 text-right text-[10px] font-semibold ${pct != null ? bgChg(pct) : ""}`} style={TNUM}>
            {pct != null ? fmtPct(pct) : ""}
          </span>
          <span className="min-w-0 flex-1">
            {sp && sp.points.length > 1 && (
              <Spark points={sp.points} prec={sp.prec} width={120} height={20} fluid session={sparkData?.session || "ashare"} />
            )}
          </span>
      </Tag>
    );
  }

  // ---- plain / card 双行 Grid 布局(个股) ----
  const hasFlow = Boolean(flow);
  const hasAmount = Boolean(amount);
  const hasTurnover = Boolean(turnover);
  const nameW = variant === "card" ? "56px" : "72px";

  // 动态网格: 无 flow 时合并为单列 spark, 无 amount/turnover 时折叠对应列
  let gridCols: string;
  let sparkColSpan: number;
  const prefix = rank != null ? "auto " : "";
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
        {/* 左格: 名称+代码, 跨2行 */}
        <div className="row-span-2 flex min-w-0 flex-col justify-center gap-1 leading-none">
          <span className="truncate text-[12px] text-slate-200">{name}</span>
          <span className="text-[10px] text-slate-500">{subtitle}</span>
        </div>

        {/* 第一行: 分时图(跨 sparkColSpan 列, 恒占 20px 高度) */}
        <div className={`flex h-[20px] min-w-0 items-center self-center`} style={{ gridColumn: `span ${sparkColSpan}` }}>
          {sp && sp.points.length > 1 && (
            <Spark points={sp.points} prec={sp.prec} width={160} height={20} fluid session={sparkData?.session || "ashare"} />
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

        {/* 第二行: 主力净额 / 净占比(进度条) / 换手率 / 涨跌幅 */}
        {hasFlow ? (
          <Stat
            label={compact ? "净" : "主力净额"}
            value={fl ? fmtYuan(fl.netIn) : "—"}
            valueCls={`font-semibold ${fl ? clsChg(fl.netIn) : "text-slate-600"}`}
          />
        ) : (
          (hasFlow || hasAmount || hasTurnover) ? <div /> : null
        )}
        {hasFlow ? (
          <div className="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap leading-none">
            <span className="shrink-0 text-[9px] text-slate-600">{compact ? "占" : "净占比"}</span>
            <span className="h-1 min-w-0 flex-1 self-center rounded-full bg-slate-800">
              <span
                className={`block h-1 rounded-full ${fl && fl.netRatio < 0 ? "bg-emerald-400/80" : "bg-rose-400/80"}`}
                style={{ width: `${ratioBar}%` }}
              />
            </span>
            <span className={`truncate text-[11px] ${fl ? clsChg(fl.netRatio) : "text-slate-600"}`} style={TNUM}>
              {fl ? `${fl.netRatio.toFixed(1)}%` : "—"}
            </span>
          </div>
        ) : (
          (hasFlow || hasAmount || hasTurnover) ? <div /> : null
        )}
        {hasTurnover ? <Stat label="换" value={turnover} /> : (
          (hasFlow || hasAmount || hasTurnover) ? <div /> : null
        )}
        {/* 涨跌幅: 商品模式只有 price+pct 两列, 显示在两行; 个股模式在第二行 */}
        {!hasFlow && !hasAmount && !hasTurnover ? (
          // 商品模式: price 在第一行, chg% 在第二行; 但第一行 spark 占位了, 需要调整
          // 这里在第二行渲染 price + chg%
          <>
            <Stat label="价" value={p != null ? fmtPrice(p) : "—"} />
            <Stat
              label="幅"
              value={pc != null ? fmtPct(pc, 1) : ""}
              valueCls={`font-semibold ${pc != null ? clsChg(pc) : "text-slate-600"}`}
            />
          </>
        ) : (
          <Stat
            label="幅"
            value={pc != null ? fmtPct(pc, variant === "card" ? 1 : 2) : ""}
            valueCls={`font-semibold ${pc != null ? clsChg(pc) : "text-slate-600"}`}
          />
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
