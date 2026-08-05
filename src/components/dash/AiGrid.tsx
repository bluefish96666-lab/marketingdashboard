import { memo, useState, type ComponentType } from "react";
import { type PanelZoomProps } from "@/components/dash/Panel";

type PanelCompProps = { className?: string } & PanelZoomProps;

export interface AiCellDef {
  id: string;
  component: ComponentType<PanelCompProps>;
  /** lg 下的网格放置(跨行/跨列), 如 "lg:col-start-1 lg:row-start-1 lg:row-span-2" */
  area: string;
  mobileH: string;
}

const MemoCell = memo(function MemoCell({ component: C, ...props }: { component: ComponentType<PanelCompProps> } & PanelCompProps) {
  return <C {...props} />;
});

/** /ai 页专用 2×3 网格: 首面板跨两行一列, 其余各占一格; 放大时单元格铺满整个网格 */
export function AiGrid({ cells }: { cells: AiCellDef[] }) {
  const [zoomedId, setZoomedId] = useState<string | null>(null);
  const toggle = (id: string) => setZoomedId((p) => (p === id ? null : id));

  return (
    <main className="grid min-h-0 flex-1 grid-cols-1 gap-1 overflow-y-auto p-1 lg:grid-cols-3 lg:grid-rows-2 lg:overflow-hidden">
      {cells.map((c) => (
        <div
          key={c.id}
          className={`min-h-0 transition-all duration-300 ${c.mobileH} lg:h-full ${
            zoomedId === c.id ? "z-10 lg:col-span-3 lg:row-span-2" : c.area
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
