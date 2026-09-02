import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useSharedPolling } from "@/hooks/useSharedPolling";
import { useQuotes } from "@/lib/market";
import { api } from "@/lib/api";
import { INDICES, FOREX, COMMODITIES } from "@/config/dashboard";
import { POLL } from "@/lib/intervals";
import { clsChg, fmtPct, fmtPrice } from "@/lib/format";
import { BRAND } from "@/config/branding";
import { GMT_PRESETS, GMT_WIDGET_META, WIDGET_IDS, useGmtDemo } from "./gmt-context";
import { GmtGrid } from "./GmtGrid";
import { GmtInspector } from "./GmtInspector";
import { GmtStatusWidget } from "./widgets/GmtStatusWidget";
import "./gmt-terminal.css";

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

function GmtTape() {
  const { tapePaused, setTapePaused, openInspect, reportSource } = useGmtDemo();
  const codes = useMemo(() => [...INDICES.map((i) => i.code), ...FOREX.map((i) => i.code)], []);
  const futureCodes = useMemo(() => COMMODITIES.map((c) => c.code), []);
  const quotes = useQuotes(codes);
  const futures = useQuotes(futureCodes);
  const { data: treasuries } = useSharedPolling("gmt:treasury", () => api.treasuries(), POLL.TREASURY_LIVE);
  const qn = quotes ? Object.keys(quotes).length : 0;
  useEffect(() => {
    if (qn > 0) reportSource("tape", "行情带 · 统一报价中心", true, qn);
  }, [qn, reportSource]);
  useEffect(() => {
    if (treasuries) reportSource("treasury", "美债收益率 · /api/treasuries", treasuries.length > 0, treasuries.length);
  }, [treasuries, reportSource]);

  const items = useMemo(() => {
    const list: { key: string; sym: string; label: string; price: number; pct: number; digits?: number; src: string }[] = [];
    for (const d of [...INDICES, ...FOREX]) {
      const q = quotes?.[d.code];
      if (q) list.push({ key: d.code, sym: d.code.replace(/^(sh|sz|hk|us|wh)/, "").toUpperCase(), label: d.label, price: q.price, pct: q.pct, src: "腾讯行情" });
    }
    for (const c of COMMODITIES.slice(0, 4)) {
      const q = futures?.[c.code];
      if (q) list.push({ key: c.code, sym: c.code.replace(/^(hf_|nf_)/, ""), label: c.label, price: q.price, pct: q.pct, src: "新浪期货" });
    }
    for (const sym of ["US10Y", "US2Y"]) {
      const t = treasuries?.find((x) => x.symbol === sym);
      if (t) list.push({ key: sym, sym, label: `美债${sym.replace("US", "")}`, price: t.yield, pct: t.yield ? (t.change / t.yield) * 100 : 0, digits: 3, src: "美国财政部" });
    }
    return list;
  }, [quotes, futures, treasuries]);

  const track = items.length ? [...items, ...items] : [];

  return (
    <div className="gmt-tape-wrap">
      <button type="button" className="gmt-tape-ctl" onClick={() => setTapePaused((p) => !p)} title={tapePaused ? "继续滚动" : "暂停滚动"}>
        {tapePaused ? "▶" : "❚❚"}
      </button>
      <div className="gmt-tape-viewport">
        {track.length ? (
          <div className={`gmt-tape-track${tapePaused ? " paused" : ""}`}>
            {track.map((it, i) => {
              const chg = it.digits != null ? (it.price * it.pct) / 100 : (it.price * it.pct) / (100 + it.pct);
              return (
                <button
                  key={`${it.key}-${i}`}
                  type="button"
                  className="gmt-tape-item"
                  onClick={() => openInspect({ type: "index", label: it.label, price: it.price, pct: it.pct, rows: [["代码", it.sym], ["来源", it.src]] })}
                >
                  <span className="ts">{it.label}</span>
                  <span className="tl">{it.digits != null ? it.price.toFixed(it.digits) : fmtPrice(it.price)}</span>
                  <span className={`tc ${clsChg(it.pct)}`}>{chg > 0 ? "+" : ""}{chg.toFixed(it.digits ?? 2)}</span>
                  <span className={`tp ${clsChg(it.pct)}`}>{fmtPct(it.pct)}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <span className="gmt-tape-item" style={{ color: "var(--gmt-dim)" }}>行情带加载中…</span>
        )}
      </div>
    </div>
  );
}

function AddWidgetMenu() {
  const { layout, toggleWidget } = useGmtDemo();
  const [open, setOpen] = useState(false);
  return (
    <span className="gmt-add-wrap">
      <button type="button" className={`gmt-tb-btn${open ? " on" : ""}`} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        + 添加组件 ▾
      </button>
      {open && (
        <div className="gmt-menu" onMouseLeave={() => setOpen(false)}>
          {WIDGET_IDS.map((id) => {
            const on = layout[id].visible;
            return (
              <button key={id} type="button" onClick={() => toggleWidget(id)}>
                <span>
                  <span className="w-num">{GMT_WIDGET_META[id].num}</span> {GMT_WIDGET_META[id].title}
                </span>
                <span style={{ color: on ? "var(--gmt-cyan)" : "var(--gmt-amber)" }}>{on ? "● 已显示" : "+ 添加"}</span>
              </button>
            );
          })}
        </div>
      )}
    </span>
  );
}

function Overlay({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="gmt-overlay" onClick={onClose}>
      <div className="gmt-overlay-box" style={wide ? { width: "min(860px, 94vw)" } : undefined} onClick={(e) => e.stopPropagation()}>
        <div className="gmt-overlay-head">
          <span>{title}</span>
          <button type="button" onClick={onClose}>✕</button>
        </div>
        <div className="gmt-overlay-body">{children}</div>
      </div>
    </div>
  );
}

function GmtHelp() {
  const { helpOpen, setHelpOpen } = useGmtDemo();
  if (!helpOpen) return null;
  const rows: [string, string][] = [
    ["01 热力矩阵", "产业链分组 treemap；点色块 → 04 分时 + 检查器；chip 切换分组/涨跌/面积/列表"],
    ["02 市场宽度", "上涨/下跌/平盘 · 涨跌比 · 领涨/领跌 · 中位数；点上涨/下跌筛选 01"],
    ["03 新闻快讯", "关键词 chip 过滤 · ▶自动滚动 · 点条目看全文与来源"],
    ["04 选中标的", "统计条（开/前收/高/低/额/换手）+ 分时曲线"],
    ["05 板块日内走势", "产业链等权日内曲线 + 各组涨跌横条；点横条筛选 01"],
    ["06 贵金属", "GC / XAU / AU / SI 四卡 + 金银比 / 期现价差 / 沪金内外盘 + 60 日线"],
    ["07 市场脉搏", "北京大钟 · 五大交易所开闭状态与倒计时 · 24h 时段甘特"],
    ["08 全球指数", "按美洲 / 港股 / A 股 / 汇率分组，带交易时段徽标"],
    ["09 数据状态", "各数据源心跳：状态 / 条数 / 最近刷新"],
    ["10 主力净流入", "东财口径 TOP15；点个股 → 04 + 检查器"],
  ];
  return (
    <Overlay title="GMT 终端 · 帮助" onClose={() => setHelpOpen(false)} wide>
      <table className="gmt-kv">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td style={{ color: "var(--gmt-amber)", fontWeight: 700 }}>{k}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: 10 }}>
        <b style={{ color: "var(--gmt-amber)" }}>编辑布局 [E]</b>：拖标题移动 · 拖右下角缩放 · ▲▼ 上下移一行 · 🔓 锁定 · — 最小化 · ⤢ 放大 · ✕ 关闭；重叠时其它组件自动下推；布局与预设保存在本机。
      </p>
      <p className="note">[F1] / [?] 帮助 · [E] 编辑 · [D] 数据源 · [I] 检查器 · [Esc] 关闭浮层 / 退出编辑 / 还原放大</p>
    </Overlay>
  );
}

function GmtData() {
  const { dataOpen, setDataOpen } = useGmtDemo();
  if (!dataOpen) return null;
  return (
    <Overlay title="数据源 · 实时状态" onClose={() => setDataOpen(false)} wide>
      <div style={{ maxHeight: "60vh", overflow: "auto" }}>
        <GmtStatusWidget />
      </div>
      <p className="note">全部来自本机数据服务 /api/*（腾讯 · 东财 · 新浪 · 华尔街见闻 · 美国财政部）· 与 09 组件同一份心跳</p>
    </Overlay>
  );
}

/** 全页 GMT 终端 shell：命令栏 + 行情带 + 工具栏 + grid + 检查器（对齐 Kimi K3 v2.2） */
export function GmtTerminalShell() {
  const { editMode, setEditMode, preset, applyPreset, resetLayout, setHelpOpen, setDataOpen, inspectorOpen, setInspectorOpen, setZoomed, sources } = useGmtDemo();
  const now = useClock();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "F1" || (e.key === "?" && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault();
        setHelpOpen((v) => !v);
      }
      if (e.key === "e" || e.key === "E") setEditMode((v) => !v);
      if (e.key === "d" || e.key === "D") setDataOpen((v) => !v);
      if (e.key === "i" || e.key === "I") setInspectorOpen((v) => !v);
      if (e.key === "Escape") {
        setHelpOpen(false);
        setDataOpen(false);
        setEditMode(false);
        setZoomed(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setEditMode, setHelpOpen, setDataOpen, setInspectorOpen, setZoomed]);

  useEffect(() => {
    document.body.classList.toggle("gmt-editing", editMode);
    return () => document.body.classList.remove("gmt-editing");
  }, [editMode]);

  const clock = now.toLocaleTimeString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" });
  const stats = Object.values(sources);
  const okN = stats.filter((s) => s.ok).length;
  const live = stats.length > 0 && okN === stats.length;
  const conn = !stats.length ? "○ 连接中" : live ? "● 实时·在线" : `▲ ${stats.length - okN} 源异常`;

  return (
    <div className="gmt-terminal">
      <header className="gmt-cmdbar">
        <span className="cmd-left">
          <span className="logo">
            GMT<b>//</b>{BRAND.title}
          </span>
          <span className="ver">v4 · K3</span>
        </span>
        <div className="cmd-mid">
          <button type="button" className="gmt-cmd-btn" onClick={() => setHelpOpen(true)}>[F1] 帮助</button>
          <button type="button" className={`gmt-cmd-btn${editMode ? " on" : ""}`} onClick={() => setEditMode((v) => !v)}>[E] 编辑</button>
          <button type="button" className="gmt-cmd-btn" onClick={() => setDataOpen(true)}>[D] 数据</button>
          <button type="button" className={`gmt-cmd-btn${inspectorOpen ? " on" : ""}`} onClick={() => setInspectorOpen((v) => !v)}>[I] 检查</button>
        </div>
        <div className="cmd-right">
          <span className="gmt-mode-badge">实时行情</span>
          <span className="gmt-conn" style={{ color: live ? "#003a1c" : stats.length ? "#3a0000" : "#222" }}>{conn}</span>
          <span className="gmt-clock">{clock}</span>
        </div>
      </header>

      <GmtTape />

      <div className="gmt-toolbar">
        <button type="button" className={`gmt-tb-btn${editMode ? " on" : ""}`} onClick={() => setEditMode((v) => !v)} aria-pressed={editMode}>
          ▦ 编辑布局
        </button>
        <AddWidgetMenu />
        <span className="gmt-tb-sep" />
        <span className="gmt-tb-label">预设▸</span>
        {GMT_PRESETS.map((p) => (
          <button key={p.id} type="button" className={`gmt-tb-btn${preset === p.id ? " on" : ""}`} onClick={() => applyPreset(p.id)}>
            {p.label}
          </button>
        ))}
        <span className="gmt-tb-sep" />
        <button type="button" className="gmt-tb-btn warn" onClick={resetLayout}>
          ↺ 恢复默认
        </button>
        {editMode && <span className="gmt-edit-hint">编辑模式 · 拖标题移动 · 拖右下角缩放 · ▲▼ 调序 · 🔓 锁定 · Esc 退出</span>}
      </div>

      <div className="gmt-main">
        <GmtGrid />
      </div>

      <GmtInspector />
      <GmtHelp />
      <GmtData />

      <Link to="/" className="gmt-back-link">
        ← 返回主看板
      </Link>
    </div>
  );
}
