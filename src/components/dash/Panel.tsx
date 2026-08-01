import type { ReactNode } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { isTv } from "@/lib/tv";

export interface PanelZoomProps {
  panelId?: string;
  isZoomed?: boolean;
  onToggleZoom?: (id: string) => void;
}

interface PanelProps extends PanelZoomProps {
  title: string;
  icon?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  accent?: string;
}

/** 驾驶舱面板容器 — 终端风格 */
export function Panel({
  title,
  icon,
  right,
  children,
  className = "",
  bodyClassName = "",
  accent = "#38bdf8",
  panelId,
  isZoomed = false,
  onToggleZoom,
}: PanelProps) {
  // TV: 放大 = 全屏浮层(兄弟面板尺寸不变, 零重排; 老电视GPU上整屏reflow是缩放卡顿主因)
  const tvOverlay = isTv && isZoomed;
  return (
    <>
      {tvOverlay && <div className="fixed left-0 right-0 top-0 bottom-0 z-[55] bg-black/70" />}
      <section
        className={`flex min-h-0 flex-col rounded-md border bg-[#0c1320]/90 shadow-[0_0_24px_rgba(0,0,0,0.35)] backdrop-blur transition-all duration-300 ${
          isZoomed ? "border-cyan-500/50 shadow-[0_0_32px_rgba(34,211,238,0.18)]" : "border-slate-700/40"
        } ${tvOverlay ? "fixed left-6 right-6 top-6 bottom-6 z-[60] bg-[#0c1320]" : ""} ${className}`}
      {...(isTv && panelId && onToggleZoom
        ? {
            // TV 模式: 面板整体可聚焦, OK 键 = 放大/还原(点击内部按钮/输入框时不触发)
            // data-tv-zoomed 供 TV 壳 App 返回键识别并还原已放大面板
            "data-tv-focusable": true,
            "data-tv-zoomed": isZoomed || undefined,
            tabIndex: -1,
            onClick: (e: React.MouseEvent) => {
              if ((e.target as HTMLElement).closest("button, a, input, select, textarea")) return;
              onToggleZoom(panelId);
            },
          }
        : {})}
    >
      <header className="flex h-8 shrink-0 items-center gap-2 border-b border-slate-700/40 px-2.5">
        <span className="inline-block h-3.5 w-1 rounded-sm" style={{ background: accent }} />
        {icon && <span className="text-[13px] leading-none" style={{ color: accent }}>{icon}</span>}
        <h2 className="text-[13px] font-semibold tracking-wide text-slate-200">{title}</h2>
        <div className="ml-auto flex items-center gap-2">
          {right}
          {panelId && onToggleZoom && (
            <button
              type="button"
              onClick={() => onToggleZoom(panelId)}
              title={isZoomed ? "缩小" : "放大"}
              className={`flex h-[22px] w-[22px] items-center justify-center rounded border transition-colors ${
                isZoomed
                  ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-300"
                  : "border-slate-700/60 bg-slate-800/40 text-slate-400 hover:border-cyan-500/60 hover:text-cyan-300"
              }`}
            >
              {isZoomed ? <ZoomOut size={12} /> : <ZoomIn size={12} />}
            </button>
          )}
        </div>
      </header>
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
      </section>
    </>
  );
}
