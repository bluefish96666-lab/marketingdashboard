import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useElementSize } from "@/hooks/useElementSize";
import { GMT_COLS, GMT_WIDGET_META, WIDGET_IDS, useGmtDemo, type WidgetId, type WidgetLayoutItem } from "./gmt-context";
import { GmtHeatmapWidget } from "./widgets/GmtHeatmapWidget";
import { GmtBreadthWidget } from "./widgets/GmtBreadthWidget";
import { GmtNewsWidget } from "./widgets/GmtNewsWidget";
import { GmtChartWidget } from "./widgets/GmtChartWidget";
import { GmtSectorWidget } from "./widgets/GmtSectorWidget";
import { GmtMetalsWidget } from "./widgets/GmtMetalsWidget";
import { GmtPulseWidget } from "./widgets/GmtPulseWidget";
import { GmtIndicesWidget } from "./widgets/GmtIndicesWidget";
import { GmtStatusWidget } from "./widgets/GmtStatusWidget";
import { GmtFlowWidget } from "./widgets/GmtFlowWidget";
import { GmtWatchlistWidget } from "./widgets/GmtWatchlistWidget";
import { GmtTreasuryWidget } from "./widgets/GmtTreasuryWidget";

const ROWH = 84;
const GAP = 8;
const HEAD_H = 22;
const STACK_BP = 760;

const WIDGET_BODY: Record<WidgetId, React.ComponentType> = {
  heatmap: GmtHeatmapWidget,
  breadth: GmtBreadthWidget,
  news: GmtNewsWidget,
  chart: GmtChartWidget,
  sector: GmtSectorWidget,
  metals: GmtMetalsWidget,
  pulse: GmtPulseWidget,
  indices: GmtIndicesWidget,
  status: GmtStatusWidget,
  flow: GmtFlowWidget,
  watchlist: GmtWatchlistWidget,
  treasury: GmtTreasuryWidget,
};

function widgetStyle(item: WidgetLayoutItem, unit: number): React.CSSProperties {
  return {
    left: item.x * (unit + GAP),
    width: item.w * unit + (item.w - 1) * GAP,
    top: item.y * (ROWH + GAP),
    height: item.min ? HEAD_H + 2 : item.h * ROWH + (item.h - 1) * GAP,
  };
}

type Drag = { id: WidgetId; mode: "move" | "resize"; sx: number; sy: number; start: WidgetLayoutItem };

/** 12 列绝对定位 grid + 01–10 组件；编辑模式下拖标题移动、拖右下角缩放、▲▼ 调序、🔓 锁定；<760px 单列堆叠 */
export function GmtGrid() {
  const { layout, editMode, inspectorOpen, updateWidget, removeWidget, nudgeWidget, zoomed, setZoomed, focused, setFocused, sources , titleOverrides} = useGmtDemo();
  const { ref, size } = useElementSize(40);
  const dragRef = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<{ mode: Drag["mode"]; id: WidgetId } | null>(null);

  const stacked = size.w > 0 && size.w < STACK_BP;
  const innerW = Math.max(0, size.w - GAP * 2 - (inspectorOpen && !stacked ? 340 : 0));
  const unit = innerW > 0 ? (innerW - GAP * (GMT_COLS - 1)) / GMT_COLS : 0;
  const unitRef = useRef(unit);
  useEffect(() => {
    unitRef.current = unit;
  }, [unit]);

  const maxRow = useMemo(() => {
    let m = 0;
    for (const id of WIDGET_IDS) {
      const it = layout[id];
      if (it.visible) m = Math.max(m, it.y + it.h);
    }
    return m;
  }, [layout]);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const d = dragRef.current;
      const u = unitRef.current;
      if (!d || u <= 0) return;
      const dxCells = Math.round((e.clientX - d.sx) / (u + GAP));
      const dyCells = Math.round((e.clientY - d.sy) / (ROWH + GAP));
      if (d.mode === "move") updateWidget(d.id, { x: d.start.x + dxCells, y: d.start.y + dyCells });
      else updateWidget(d.id, { w: d.start.w + dxCells, h: d.start.h + dyCells });
    },
    [updateWidget]
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDragging(null);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag);
    };
  }, [dragging, onPointerMove, endDrag]);

  const beginDrag = (e: ReactPointerEvent, id: WidgetId, mode: Drag["mode"]) => {
    if (!editMode || zoomed || stacked || layout[id].locked) return;
    e.preventDefault();
    dragRef.current = { id, mode, sx: e.clientX, sy: e.clientY, start: layout[id] };
    setFocused(id);
    setDragging({ mode, id });
  };

  const ordered = useMemo(() => WIDGET_IDS.filter((id) => layout[id].visible).sort((a, b) => layout[a].y - layout[b].y || layout[a].x - layout[b].x), [layout]);

  return (
    <div
      ref={ref}
      className={`gmt-grid${editMode ? " editing" : ""}${stacked ? " stacked" : ""}`}
      data-dragging={dragging?.mode}
      style={stacked ? undefined : { minHeight: maxRow * (ROWH + GAP) + GAP * 2 }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) setFocused(null);
      }}
    >
      {(stacked || unit > 0) &&
        ordered.map((id) => {
          const item = layout[id];
          const meta = GMT_WIDGET_META[id];
          const Body = WIDGET_BODY[id];
          const isZoom = zoomed === id;
          const src = Object.values(sources).find((s) => s.label.startsWith(meta.title.split(" · ")[0].slice(0, 2)));
          const asOf = src ? `as-of ${new Date(src.at).toLocaleTimeString("zh-CN", { hour12: false })}（北京）` : meta.note;
          const cls = ["gmt-widget", isZoom && "zoomed", focused === id && "focused", item.locked && "locked", item.min && "min", dragging?.id === id && "dragging"]
            .filter(Boolean)
            .join(" ");
          return (
            <div
              key={id}
              className={cls}
              style={isZoom || stacked ? (stacked && !isZoom ? { height: item.min ? HEAD_H + 2 : Math.min(item.h, 6) * ROWH } : undefined) : widgetStyle(item, unit)}
              onPointerDownCapture={() => setFocused(id)}
            >
              <header
                className="w-head"
                onPointerDown={(e) => {
                  if ((e.target as HTMLElement).closest("button")) return;
                  beginDrag(e, id, "move");
                }}
                onDoubleClick={() => setZoomed(isZoom ? null : id)}
                title={editMode && !item.locked ? "拖动移动 · 双击放大" : "双击放大"}
              >
                <span className="w-num">{meta.num}</span>
                <span className="w-title">{titleOverrides[id] ?? meta.title}</span>
                <span className="w-asof">{asOf}</span>
                {editMode && !stacked && (
                  <span className="w-order">
                    <button type="button" className="w-btn" title="上移一行" onClick={() => nudgeWidget(id, -1)}>▲</button>
                    <button type="button" className="w-btn" title="下移一行" onClick={() => nudgeWidget(id, 1)}>▼</button>
                  </span>
                )}
                <button type="button" className="w-btn" title={item.locked ? "解锁（允许拖动/缩放）" : "锁定位置与尺寸"} onClick={() => updateWidget(id, { locked: !item.locked })}>
                  {item.locked ? "🔒" : "🔓"}
                </button>
                <button type="button" className="w-btn" title={item.min ? "展开" : "最小化"} onClick={() => updateWidget(id, { min: !item.min })}>
                  {item.min ? "▭" : "—"}
                </button>
                <button type="button" className="w-btn" title={isZoom ? "还原" : "放大"} onClick={() => setZoomed(isZoom ? null : id)}>
                  {isZoom ? "⤡" : "⤢"}
                </button>
                <button type="button" className="w-btn" title="关闭组件（可从 + 添加组件 恢复）" onClick={() => removeWidget(id)}>
                  ✕
                </button>
              </header>
              {!item.min && (
                <div className="w-body">
                  <Body />
                </div>
              )}
              {editMode && !isZoom && !stacked && !item.locked && !item.min && (
                <div className="w-resize" onPointerDown={(e) => beginDrag(e, id, "resize")} title="拖动缩放" />
              )}
            </div>
          );
        })}
      {zoomed && <div className="gmt-zoom-backdrop" onClick={() => setZoomed(null)} />}
    </div>
  );
}
