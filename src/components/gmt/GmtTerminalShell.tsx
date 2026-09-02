import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useSharedPolling } from "@/hooks/useSharedPolling";
import { useQuotes } from "@/lib/market";
import { api } from "@/lib/api";
import { INDICES, FOREX, COMMODITIES } from "@/config/dashboard";
import { POLL } from "@/lib/intervals";
import { clsChg, fmtPct, fmtPrice } from "@/lib/format";
import { GMT_WIDGET_META, WIDGET_IDS, useGmtDemo, type GmtPreset } from "./gmt-context";
import { GmtGrid } from "./GmtGrid";
import { GmtInspector } from "./GmtInspector";
import "./gmt-terminal.css";

const PRESETS: { id: GmtPreset; label: string }[] = [
  { id: "GLOBAL", label: "GLOBAL" },
  { id: "EQUITIES", label: "EQUITIES" },
  { id: "MACRO", label: "MACRO" },
  { id: "FLOW", label: "FLOW" },
];

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

function GmtTape() {
  const { tapePaused, setTapePaused } = useGmtDemo();
  const codes = useMemo(() => [...INDICES.map((i) => i.code), ...FOREX.map((i) => i.code)], []);
  const futureCodes = useMemo(() => COMMODITIES.map((c) => c.code), []);
  const quotes = useQuotes(codes);
  const futures = useQuotes(futureCodes);
  const { data: treasuries } = useSharedPolling("gmt:treasury", () => api.treasuries(), POLL.TREASURY_LIVE);
  const { reportSource } = useGmtDemo();
  const qn = quotes ? Object.keys(quotes).length : 0;
  useEffect(() => {
    if (qn > 0) reportSource("tape", "行情带 · 报价中心", true, qn);
  }, [qn, reportSource]);

  const items = useMemo(() => {
    const list: { key: string; label: string; price: number; pct: number; digits?: number }[] = [];
    for (const d of [...INDICES, ...FOREX]) {
      const q = quotes?.[d.code];
      if (q) list.push({ key: d.code, label: d.label, price: q.price, pct: q.pct });
    }
    for (const c of COMMODITIES.slice(0, 3)) {
      const q = futures?.[c.code];
      if (q) list.push({ key: c.code, label: c.label, price: q.price, pct: q.pct });
    }
    for (const sym of ["US10Y", "US2Y"]) {
      const t = treasuries?.find((x) => x.symbol === sym);
      if (t)
        list.push({
          key: sym,
          label: `美债${sym.replace("US", "")}`,
          price: t.yield,
          pct: t.yield ? (t.change / t.yield) * 100 : 0,
          digits: 3,
        });
    }
    return list;
  }, [quotes, futures, treasuries]);

  const track = items.length ? [...items, ...items] : [];

  return (
    <div className="gmt-tape-wrap">
      <button type="button" className="gmt-tape-ctl" onClick={() => setTapePaused((p) => !p)}>
        {tapePaused ? "▶" : "❚❚"}
      </button>
      <div className="gmt-tape-viewport">
        {track.length ? (
          <div className={`gmt-tape-track${tapePaused ? " paused" : ""}`}>
            {track.map((it, i) => (
              <span key={`${it.key}-${i}`} className="gmt-tape-item">
                <span>{it.label}</span>
                <span>{it.digits != null ? it.price.toFixed(it.digits) : fmtPrice(it.price)}</span>
                <span className={clsChg(it.pct)}>{fmtPct(it.pct)}</span>
              </span>
            ))}
          </div>
        ) : (
          <span className="gmt-tape-item" style={{ color: "var(--gmt-dim)" }}>
            行情带加载中…
          </span>
        )}
      </div>
    </div>
  );
}

function AddWidgetMenu() {
  const { layout, addWidget } = useGmtDemo();
  const [open, setOpen] = useState(false);
  const hidden = WIDGET_IDS.filter((id) => !layout[id].visible);
  return (
    <span className="gmt-add-wrap">
      <button
        type="button"
        className={`gmt-tb-btn${open ? " on" : ""}`}
        onClick={() => setOpen((v) => !v)}
        disabled={!hidden.length}
        title={hidden.length ? "添加已关闭的组件" : "所有组件已显示"}
      >
        + 添加组件{hidden.length ? ` (${hidden.length})` : ""}
      </button>
      {open && hidden.length > 0 && (
        <div className="gmt-add-menu" onMouseLeave={() => setOpen(false)}>
          {hidden.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                addWidget(id);
                setOpen(false);
              }}
            >
              <span className="w-num">{GMT_WIDGET_META[id].num}</span> {GMT_WIDGET_META[id].title}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function GmtHelp() {
  const { helpOpen, setHelpOpen } = useGmtDemo();
  if (!helpOpen) return null;
  return (
    <div className="gmt-overlay" onClick={() => setHelpOpen(false)}>
      <div className="gmt-overlay-box" onClick={(e) => e.stopPropagation()}>
        <div className="gmt-overlay-head">
          <span>GMT TERMINAL · 帮助</span>
          <button type="button" onClick={() => setHelpOpen(false)}>
            ✕
          </button>
        </div>
        <div className="gmt-overlay-body">
          <p>
            <b style={{ color: "var(--gmt-amber)" }}>01 热力矩阵</b> — 产业链分组 treemap，点击个股联动 04 分时与右侧检查器。
          </p>
          <p style={{ marginTop: 6 }}>
            <b style={{ color: "var(--gmt-amber)" }}>02 市场宽度</b> — 上涨/下跌占比，点击筛选 01。
          </p>
          <p style={{ marginTop: 6 }}>
            <b style={{ color: "var(--gmt-amber)" }}>03 快讯</b> — 7×24 滚动新闻，点击查看详情。
          </p>
          <p style={{ marginTop: 6 }}>
            <b style={{ color: "var(--gmt-amber)" }}>04 分时</b> — 当前选中标的 intraday 曲线。
          </p>
          <p style={{ marginTop: 6 }}>
            <b style={{ color: "var(--gmt-amber)" }}>05 板块</b> — 行业涨跌榜，点击联动 01 分组。
          </p>
          <p style={{ marginTop: 6 }}>
            <b style={{ color: "var(--gmt-amber)" }}>06–09</b> — 全球指数 · 主力净流入 · 商品/美债 · 数据状态。
          </p>
          <p style={{ marginTop: 10, color: "var(--gmt-fg)" }}>
            <b style={{ color: "var(--gmt-amber)" }}>编辑布局 [E]</b>：拖组件标题移动，拖右下角缩放，✕ 关闭；
            工具栏「+ 添加组件」恢复；布局自动保存到本机。双击标题放大。
          </p>
          <p className="note">
            [F1/?] 帮助 · [E] 编辑布局 · [I] 检查器 · [Esc] 关闭浮层/退出编辑
            <br />
            PREVIEW V4 · demo only · 未替换首页 /
          </p>
        </div>
      </div>
    </div>
  );
}

/** 全页 GMT 终端 shell：三层顶栏 + grid + inspector */
export function GmtTerminalShell() {
  const {
    editMode,
    setEditMode,
    preset,
    applyPreset,
    resetLayout,
    setHelpOpen,
    inspectorOpen,
    setInspectorOpen,
    setZoomed,
  } = useGmtDemo();
  const now = useClock();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "F1" || (e.key === "?" && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault();
        setHelpOpen((v) => !v);
      }
      if (e.key === "e" || e.key === "E") setEditMode((v) => !v);
      if (e.key === "i" || e.key === "I") setInspectorOpen((v) => !v);
      if (e.key === "Escape") {
        setHelpOpen(false);
        setEditMode(false);
        setZoomed(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setEditMode, setHelpOpen, setInspectorOpen, setZoomed]);

  const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

  return (
    <div className="gmt-terminal">
      <header className="gmt-cmdbar">
        <span className="logo">
          GMT<b>//</b>老孙的交易台
        </span>
        <span className="ver">v4 preview</span>
        <div className="cmd-mid">
          <button type="button" className="gmt-cmd-btn" onClick={() => setHelpOpen(true)} title="帮助 F1">
            [F1]
          </button>
          <button type="button" className="gmt-cmd-btn" onClick={() => setEditMode((v) => !v)} title="编辑 E">
            [E]
          </button>
          <button type="button" className="gmt-cmd-btn" onClick={() => setInspectorOpen((v) => !v)} title="检查器 I">
            [I]
          </button>
        </div>
        <div className="cmd-right">
          <span className="gmt-mode-badge">{preset}</span>
          <span className="gmt-conn">● LIVE</span>
          <span className="gmt-clock">{clock}</span>
        </div>
      </header>

      <GmtTape />

      <div className="gmt-toolbar">
        <span className="gmt-tb-label">LAYOUT</span>
        <button
          type="button"
          className={`gmt-tb-btn${editMode ? " on" : ""}`}
          onClick={() => setEditMode((v) => !v)}
        >
          EDIT
        </button>
        <span className="gmt-tb-sep" />
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`gmt-tb-btn${preset === p.id ? " on" : ""}`}
            onClick={() => applyPreset(p.id)}
          >
            {p.label}
          </button>
        ))}
        <span className="gmt-tb-sep" />
        <AddWidgetMenu />
        <button type="button" className="gmt-tb-btn" onClick={resetLayout}>
          RESET
        </button>
        {editMode && <span className="gmt-edit-hint">编辑模式 · 拖标题移动 · 拖右下角缩放 · ✕ 关闭 · Esc 退出</span>}
        {inspectorOpen && !editMode && (
          <span className="gmt-edit-hint" style={{ color: "var(--gmt-dim)" }}>
            检查器已开
          </span>
        )}
      </div>

      <div className="gmt-main">
        <GmtGrid />
      </div>

      <GmtInspector />
      <GmtHelp />

      <Link to="/" className="gmt-back-link">
        ← 返回主看板
      </Link>
    </div>
  );
}
