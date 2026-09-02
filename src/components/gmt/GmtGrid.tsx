import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useElementSize } from "@/hooks/useElementSize";
import { GMT_COLS, GMT_WIDGET_META, WIDGET_IDS, useGmtDemo, type WidgetId, type WidgetLayoutItem } from "./gmt-context";
import { GmtHeatmapWidget } from "./widgets/GmtHeatmapWidget";
import { GmtBreadthWidget } from "./widgets/GmtBreadthWidget";
import { GmtNewsWidget } from "./widgets/GmtNewsWidget";
import { GmtChartWidget } from "./widgets/GmtChartWidget";
import { GmtSectorWidget } from "./widgets/GmtSectorWidget";
import { GmtIndicesWidget } from "./widgets/GmtIndicesWidget";
import { GmtFlowWidget } from "./widgets/GmtFlowWidget";
import { GmtMacroWidget } from "./widgets/GmtMacroWidget";
import { GmtStatusWidget } from "./widgets/GmtStatusWidget";

const ROWH = 84;
const GAP = 8;

const WIDGET_BODY: Record<WidgetId, React.ComponentType> = {
  heatmap: GmtHeatmapWidget,
  breadth: GmtBreadthWidget,
  news: GmtNewsWidget,
  chart: GmtChartWidget,
  sector: GmtSectorWidget,
  indices: GmtIndicesWidget,
  flow: GmtFlowWidget,
  macro: GmtMacroWidget,
  status: GmtStatusWidget,
};

function widgetStyle(item: WidgetLayoutItem, unit: number): React.CSSProperties {
  return {
    left: item.x * (unit + GAP),
    width: item.w * unit + (item.w - 1) * GAP,
    top: item.y * (ROWH + GAP),
    height: item.h * ROWH + (item.h - 1) * GAP,
  };
}

function asOfLabel(): string {
  const now = new Date();
  return `as-of ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

type Drag = { id: WidgetId; mode: "move" | "resize"; sx: number; sy: number; start: WidgetLayoutItem };

/** 12 列绝对定位 grid + 01–09 组件；编辑模式下拖标题移动、拖右下角缩放 */
export function GmtGrid() {
  const { layout, editMode, inspectorOpen, updateWidget, removeWidget, zoomed, setZoomed } = useGmtDemo();
  const asOf = useMemo(() => asOfLabel(), []);
  const { ref, size } = useElementSize(40);
  const dragRef = useRef<Drag | null>(null);

  const innerW = Math.max(0, size.w - GAP * 2 - (inspectorOpen ? 340 : 0));
  const unit = innerW > 0 ? (innerW - GAP * (GMT_COLS - 1)) / GMT_COLS : 0;

  const maxRow = useMemo(() => {
    let m = 0;
    for (const id of WIDGET_IDS) {
      const it = layout[id];
      if (it.visible) m = Math.max(m, it.y + it.h);
    }
    return m;
  }, [layout]);

  const [dragging, setDragging] = useState<Drag["mode"] | null>(null);
  const unitRef = useRef(unit);
  useEffect(() => {
    unitRef.current = unit;
  }, [unit]);

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
    if (!editMode || zoomed) return;
    e.preventDefault();
    dragRef.current = { id, mode, sx: e.clientX, sy: e.clientY, start: layout[id] };
    setDragging(mode);
  };

  return (
    <div
      ref={ref}
      className={`gmt-grid${editMode ? " editing" : ""}`}
      data-dragging={dragging ?? undefined}
      style={{ minHeight: maxRow * (ROWH + GAP) + GAP * 2 }}
    >
      {unit > 0 &&
        WIDGET_IDS.map((id) => {
          const item = layout[id];
          if (!item.visible) return null;
          const meta = GMT_WIDGET_META[id];
          const Body = WIDGET_BODY[id];
          const isZoom = zoomed === id;
          return (
            <div
              key={id}
              className={`gmt-widget${isZoom ? " zoomed" : ""}`}
              style={isZoom ? undefined : widgetStyle(item, unit)}
            >
              <header
                className="w-head"
                onPointerDown={(e) => {
                  if ((e.target as HTMLElement).closest("button")) return;
                  beginDrag(e, id, "move");
                }}
                onDoubleClick={() => setZoomed(isZoom ? null : id)}
                title={editMode ? "拖动移动 · 双击放大" : "双击放大"}
              >
                <span className="w-num">{meta.num}</span>
                <span className="w-title">{meta.title}</span>
                <span className="w-asof">{asOf}</span>
                <button type="button" className="w-btn" title={isZoom ? "还原" : "放大"} onClick={() => setZoomed(isZoom ? null : id)}>
                  {isZoom ? "⤡" : "⤢"}
                </button>
                <button type="button" className="w-btn" title="关闭组件" onClick={() => removeWidget(id)}>
                  ✕
                </button>
              </header>
              <div className="w-body">
                <Body />
              </div>
              {editMode && !isZoom && (
                <div className="w-resize" onPointerDown={(e) => beginDrag(e, id, "resize")} title="拖动缩放" />
              )}
            </div>
          );
        })}
      {zoomed && <div className="gmt-zoom-backdrop" onClick={() => setZoomed(null)} />}
    </div>
  );
}
