import { LayoutGrid, RotateCcw, Info, HelpCircle } from "lucide-react";
import { HOME_LAYOUT_PRESETS, type LayoutPresetId } from "@/config/layout-presets";
import { dispatchLayoutReset } from "@/components/dash/DashboardLayout";
import { useTerminal } from "@/lib/terminal-context";

export function TerminalToolbar() {
  const { editMode, toggleEditMode, preset, setPreset, toggleInspector, toggleHelp, inspectorOpen } = useTerminal();

  const onResetLayout = () => {
    setPreset("full" as LayoutPresetId);
    dispatchLayoutReset();
  };

  return (
    <div className="terminal-toolbar flex h-7 shrink-0 items-center gap-2 border-b border-slate-700/40 bg-[#0a0e14] px-2 text-[10px]">
      <button
        type="button"
        onClick={toggleEditMode}
        className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-medium transition-colors ${
          editMode
            ? "border-[#f5c542]/60 bg-[#f5c542]/15 text-[#fde68a]"
            : "border-slate-700/60 bg-slate-800/40 text-slate-400 hover:border-[#f5c542]/40 hover:text-slate-200"
        }`}
        title="切换编辑布局 (E)"
      >
        <LayoutGrid size={11} />
        {editMode ? "编辑中" : "▦ 编辑布局"}
      </button>

      <span className="text-slate-600">预设&gt;</span>
      <div className="flex items-center gap-1">
        {HOME_LAYOUT_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPreset(p.id as LayoutPresetId)}
            className={`rounded border px-1.5 py-0.5 transition-colors ${
              preset === p.id
                ? "border-[#f5c542]/50 bg-[#f5c542]/10 text-[#fde68a]"
                : "border-transparent text-slate-500 hover:border-slate-600 hover:text-slate-300"
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={onResetLayout}
          className="inline-flex items-center gap-0.5 rounded border border-transparent px-1.5 py-0.5 text-slate-500 hover:border-slate-600 hover:text-slate-300"
          title="恢复默认布局与缩放"
        >
          <RotateCcw size={10} />
          恢复默认
        </button>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {editMode && (
          <span className="hidden text-slate-600 md:inline">
            点击面板标题查看来源 · 右上角 ⤢ 放大
          </span>
        )}
        <button
          type="button"
          onClick={toggleInspector}
          className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 transition-colors ${
            inspectorOpen
              ? "border-[#f5c542]/60 bg-[#f5c542]/15 text-[#fde68a]"
              : "border-slate-700/60 bg-slate-800/40 text-slate-400 hover:border-[#f5c542]/40"
          }`}
          title="数据检查器 (I)"
        >
          <Info size={11} />
          检查器
        </button>
        <button
          type="button"
          onClick={toggleHelp}
          className="inline-flex items-center gap-1 rounded border border-slate-700/60 bg-slate-800/40 px-2 py-0.5 text-slate-400 hover:border-[#f5c542]/40 hover:text-slate-200"
          title="快捷键帮助 (F1)"
        >
          <HelpCircle size={11} />
          帮助
        </button>
      </div>
    </div>
  );
}
