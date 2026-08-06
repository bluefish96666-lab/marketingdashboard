import { memo, useState, type ComponentType } from "react";
import { type PanelZoomProps } from "@/components/dash/Panel";

type PanelCompProps = { className?: string } & PanelZoomProps;

export interface AiCellDef {
  id: string;
  component: ComponentType<PanelCompProps>;
  /** 默认态(未放大)的网格放置, 如 "lg:col-start-1 lg:row-start-1 lg:row-span-2" */
  area: string;
  mobileH: string;
}

const MemoCell = memo(function MemoCell({ component: C, ...props }: { component: ComponentType<PanelCompProps> } & PanelCompProps) {
  return <C {...props} />;
});

/**
 * /ai 页专用 3×2 网格(移动端单列): Token 消耗左上单格, 基础设施 ROI 左下。
 * 放大 = 面板铺满整个网格区域(任何面板都只会变大), 其余面板暂时隐藏,
 * 还原即恢复 — 与 TV 模式全屏浮层同一模型, 避免重排模型下
 * "跨行面板越放越矮/兄弟面板被压扁"的问题。
 */
export function AiGrid({ cells }: { cells: AiCellDef[] }) {
  const [zoomedId, setZoomedId] = useState<string | null>(null);
  const toggle = (id: string) => setZoomedId((p) => (p === id ? null : id));
  const zoomed = zoomedId != null;

  return (
    <main className="grid min-h-0 flex-1 grid-cols-1 gap-1 overflow-y-auto p-1 lg:grid-cols-3 lg:grid-rows-2 lg:overflow-hidden">
      {cells.map((c) => (
        <div
          key={c.id}
          className={`min-h-0 transition-all duration-300 ${c.mobileH} lg:h-full ${
            zoomed ? (zoomedId === c.id ? "z-10 lg:col-start-1 lg:row-start-1 lg:col-span-3 lg:row-span-2" : "hidden") : c.area
          }`}
        >
          <MemoCell
            component={c.component}
            className="h-full"
            panelId={c.id}
            isZoomed={zoomedId === c.id}
            onToggleZoom={toggle}
          />
        </div>
      ))}
    </main>
  );
}
