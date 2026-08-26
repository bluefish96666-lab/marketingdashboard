import { X } from "lucide-react";
import { useTerminal } from "@/lib/terminal-context";

const SHORTCUTS = [
  ["F1", "打开 / 关闭帮助"],
  ["E", "切换编辑布局"],
  ["I", "切换检查器"],
  ["Esc", "关闭浮层 / 检查器"],
  ["点击标题", "编辑模式下选中面板查看来源"],
  ["⤢", "放大 / 还原面板"],
];

export function TerminalHelp() {
  const { helpOpen, setHelpOpen } = useTerminal();
  if (!helpOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={() => setHelpOpen(false)}>
      <div
        className="terminal-modal w-full max-w-md rounded-lg border border-slate-700/60 bg-[#0c1320] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-700/40 px-4 py-2.5">
          <h2 className="font-mono text-[13px] font-semibold text-[#fde68a]">
            LST<span className="text-slate-500">//</span>帮助 — 键盘快捷键
          </h2>
          <button type="button" onClick={() => setHelpOpen(false)} className="text-slate-500 hover:text-slate-300" aria-label="关闭">
            <X size={16} />
          </button>
        </header>
        <div className="px-4 py-3">
          <table className="w-full text-[12px]">
            <tbody>
              {SHORTCUTS.map(([key, desc]) => (
                <tr key={key} className="border-b border-slate-800/80 last:border-0">
                  <td className="py-1.5 pr-4 font-mono text-[#f5c542]">{key}</td>
                  <td className="py-1.5 text-slate-400">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[10px] leading-relaxed text-slate-600">
            预设可快速切换宏观 / 资金 / 产业链视图。行情数据来自腾讯、新浪、东财等公开接口，经本地 Node 代理聚合。
          </p>
        </div>
      </div>
    </div>
  );
}
