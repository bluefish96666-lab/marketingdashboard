import { memo, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { type PanelZoomProps } from "@/components/dash/Panel";
import { usePanelZoom } from "@/hooks/usePanelZoom";
import { useTerminalOptional } from "@/lib/terminal-context";
import { isTv } from "@/lib/tv";

export type PanelRowDef = {
  defaultH: number;
  panels: { id: string; component: ComponentType<{ className?: string } & PanelZoomProps>; defaultW: number; mobileH: string; maxZoomW?: number }[];
};

type PanelCompProps = { className?: string } & PanelZoomProps;

/** 面板组件的 memo 包装: 某个面板放大/还原时, 其他面板的 props 不变 */
const MemoPanel = memo(function MemoPanel({
  component: C,
  ...props
}: { component: ComponentType<PanelCompProps> } & PanelCompProps) {
  return <C {...props} />;
});

function normalizeWidths(panelDefs: PanelRowDef["panels"], hidden: Set<string>): number[] {
  const visible = panelDefs.filter((p) => !hidden.has(p.id));
  const sum = visible.reduce((s, p) => s + p.defaultW, 0) || 1;
  return panelDefs.map((p) => (hidden.has(p.id) ? 0 : p.defaultW / sum));
}

function normalizeHeights(rows: PanelRowDef[], hidden: Set<string>): number[] {
  const visibleRows = rows.map((row) => row.panels.some((p) => !hidden.has(p.id)));
  const sum = rows.reduce((s, row, i) => (visibleRows[i] ? s + row.defaultH : s), 0) || 1;
  return rows.map((row, i) => (visibleRows[i] ? row.defaultH / sum : 0));
}

/** 一屏式大屏: 行高与列宽按缩放/预设动态分配 */
export function DashboardLayout({ rows, pageKey = "home" }: { rows: PanelRowDef[]; pageKey?: string }) {
  const terminal = useTerminalOptional();
  const hidden = terminal?.hiddenPanelIds ?? new Set<string>();
  const focusPanelId = terminal?.focusPanelId ?? null;

  const { isZoomed, toggle: toggleZoom, reset, layout, zoomedId } = usePanelZoom(rows, { pageKey });
  const [sectorSel, setSectorSel] = useState<{ code: string; name: string } | null>(null);

  const defaultLayout = useMemo(
    () => ({
      rowHeights: normalizeHeights(rows, hidden),
      rowWidths: rows.map((r) => normalizeWidths(r.panels, hidden)),
    }),
    [rows, hidden]
  );

  const effLayout = useMemo(() => {
    if (isTv) return defaultLayout;
    if (!zoomedId) {
      return {
        rowHeights: normalizeHeights(rows, hidden),
        rowWidths: rows.map((r) => normalizeWidths(r.panels, hidden)),
      };
    }
    return layout;
  }, [isTv, defaultLayout, zoomedId, layout, rows, hidden]);

  // 预设切换: 自动聚焦/还原(跳过首屏, 保留 localStorage 恢复的 zoom)
  const presetRef = useRef(terminal?.preset ?? "full");
  useEffect(() => {
    if (isTv || !terminal) return;
    if (presetRef.current === terminal.preset) return;
    presetRef.current = terminal.preset;
    if (focusPanelId && !hidden.has(focusPanelId)) {
      if (!isZoomed(focusPanelId)) toggleZoom(focusPanelId);
    } else {
      reset();
    }
  }, [terminal?.preset, focusPanelId, hidden, isTv, isZoomed, toggleZoom, reset, terminal]);

  const panelLabels = useMemo(() => {
    const map: Record<string, string> = {};
    let n = 1;
    for (const row of rows) {
      for (const p of row.panels) {
        if (!hidden.has(p.id)) {
          map[p.id] = String(n).padStart(2, "0");
          n++;
        }
      }
    }
    return map;
  }, [rows, hidden]);

  // 暴露 reset 给 toolbar via custom event (simple approach - pass via context instead)

  return (
    <main className="relative flex min-h-0 flex-1 flex-col gap-1 p-1">
      {rows.map((row, rowIdx) => {
        if (effLayout.rowHeights[rowIdx] <= 0) return null;
        return (
          <div
            key={rowIdx}
            className="flex min-h-0 flex-col gap-1 transition-all duration-300 lg:h-[var(--row-h)] lg:flex-row"
            style={{ "--row-h": `${effLayout.rowHeights[rowIdx] * 100}%` } as React.CSSProperties}
          >
            {row.panels.map((panel, panelIdx) => {
              if (hidden.has(panel.id)) return null;
              const w = effLayout.rowWidths[rowIdx][panelIdx];
              if (w <= 0) return null;
              return (
                <div
                  key={panel.id}
                  className={`min-h-0 w-full transition-all duration-300 ${panel.mobileH} lg:h-full lg:w-[var(--panel-w)]`}
                  style={{ "--panel-w": `${w * 100}%` } as React.CSSProperties}
                >
                  <MemoPanel
                    component={panel.component}
                    className="h-full"
                    panelId={panel.id}
                    panelLabel={panelLabels[panel.id]}
                    isZoomed={isZoomed(panel.id)}
                    onToggleZoom={toggleZoom}
                    {...(panel.id === "boardFlow"
                      ? { onSelectSector: setSectorSel, selectedSector: sectorSel }
                      : {})}
                    {...(panel.id === "moneyFlow"
                      ? { sectorFilter: sectorSel, onClearSector: () => setSectorSel(null) }
                      : {})}
                  />
                </div>
              );
            })}
          </div>
        );
      })}
      {/* reset handler wired from parent via ref/event — use DashboardLayoutResetContext if needed */}
      <DashboardLayoutResetBridge onReset={reset} />
    </main>
  );
}

/** 供 TerminalToolbar 调用 reset */
function DashboardLayoutResetBridge({ onReset }: { onReset: () => void }) {
  useEffect(() => {
    const handler = () => onReset();
    window.addEventListener("lst:layout-reset", handler);
    return () => window.removeEventListener("lst:layout-reset", handler);
  }, [onReset]);
  return null;
}

export function dispatchLayoutReset() {
  window.dispatchEvent(new Event("lst:layout-reset"));
}
