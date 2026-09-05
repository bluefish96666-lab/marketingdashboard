import { X } from "lucide-react";
import { HOME_PANEL_REGISTRY } from "@/config/panel-registry";
import { useTerminal } from "@/lib/terminal-context";

export function TerminalInspector() {
  const { inspectorOpen, setInspectorOpen, selectedPanelId, selectPanel } = useTerminal();
  if (!inspectorOpen) return null;

  const meta = selectedPanelId ? HOME_PANEL_REGISTRY[selectedPanelId] : null;

  return (
    <aside className="terminal-inspector fixed bottom-0 right-0 top-[4.5rem] z-[70] flex w-full max-w-sm flex-col border-l border-slate-700/50 bg-[#0a0e14]/98 shadow-2xl backdrop-blur md:top-[4.5rem]">
      <header className="flex h-8 shrink-0 items-center justify-between border-b border-slate-700/40 px-3">
        <span className="font-mono text-[11px] text-[#fde68a]">▣ 数据 / 来源检查器</span>
        <button
          type="button"
          onClick={() => { setInspectorOpen(false); selectPanel(null); }}
          className="text-slate-500 hover:text-slate-300"
          aria-label="关闭检查器"
        >
          <X size={14} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 text-[11px]">
        {meta ? (
          <div className="space-y-3">
            <div>
              <div className="text-[9px] uppercase tracking-widest text-slate-600">组件</div>
              <div className="mt-0.5 font-semibold text-slate-200">{meta.title}</div>
              <div className="font-mono text-[10px] text-slate-500">{meta.id}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-widest text-slate-600">数据来源</div>
              <div className="mt-0.5 text-slate-300">{meta.source}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-widest text-slate-600">刷新频率</div>
              <div className="mt-0.5 font-mono text-[#f5c542]">{meta.refresh}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-widest text-slate-600">说明</div>
              <div className="mt-0.5 leading-relaxed text-slate-400">{meta.note}</div>
            </div>
          </div>
        ) : (
          <p className="leading-relaxed text-slate-500">
            开启「编辑布局」后点击任意面板标题，或在此查看该组件的数据来源、刷新口径与说明。
          </p>
        )}
      </div>
    </aside>
  );
}
