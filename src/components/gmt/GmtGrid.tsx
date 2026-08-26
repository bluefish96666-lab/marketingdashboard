import { useMemo } from "react";
import { GMT_WIDGET_META, useGmtDemo, type WidgetId } from "./gmt-context";
import { GmtHeatmapWidget } from "./widgets/GmtHeatmapWidget";
import { GmtBreadthWidget } from "./widgets/GmtBreadthWidget";
import { GmtNewsWidget } from "./widgets/GmtNewsWidget";
import { GmtChartWidget } from "./widgets/GmtChartWidget";
import { GmtSectorWidget } from "./widgets/GmtSectorWidget";

const COLS = 12;
const ROWH = 84;
const GAP = 8;

const WIDGET_BODY: Record<WidgetId, React.ComponentType> = {
  heatmap: GmtHeatmapWidget,
  breadth: GmtBreadthWidget,
  news: GmtNewsWidget,
  chart: GmtChartWidget,
  sector: GmtSectorWidget,
};

function widgetStyle(item: { x: number; y: number; w: number; h: number }): React.CSSProperties {
  const unit = `((100% - ${GAP * (COLS - 1)}px) / ${COLS})`;
  return {
    left: `calc(${unit} * ${item.x} + ${GAP * item.x}px)`,
    width: `calc(${unit} * ${item.w} + ${GAP * (item.w - 1)}px)`,
    top: item.y * (ROWH + GAP),
    height: item.h * ROWH + (item.h - 1) * GAP,
  };
}

function asOfLabel(): string {
  const now = new Date();
  return `as-of ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/** 12 列绝对定位 grid + 01–05 组件 */
export function GmtGrid() {
  const { layout, editMode, inspectorOpen } = useGmtDemo();
  const asOf = useMemo(() => asOfLabel(), []);

  const maxRow = useMemo(() => {
    let m = 0;
    for (const id of Object.keys(layout) as WidgetId[]) {
      const it = layout[id];
      if (it.visible) m = Math.max(m, it.y + it.h);
    }
    return m;
  }, [layout]);

  return (
    <div
      className="gmt-grid"
      style={{
        minHeight: maxRow * (ROWH + GAP),
        paddingRight: inspectorOpen ? "var(--gmt-insp-w)" : undefined,
      }}
    >
      {(Object.keys(layout) as WidgetId[]).map((id) => {
        const item = layout[id];
        if (!item.visible) return null;
        const meta = GMT_WIDGET_META[id];
        const Body = WIDGET_BODY[id];
        return (
          <div
            key={id}
            className="gmt-widget"
            style={widgetStyle(item)}
            data-edit={editMode || undefined}
          >
            <header className="w-head">
              <span className="w-num">{meta.num}</span>
              <span className="w-title">{meta.title}</span>
              <span className="w-asof">{asOf}</span>
            </header>
            <div className="w-body">
              <Body />
            </div>
          </div>
        );
      })}
    </div>
  );
}
