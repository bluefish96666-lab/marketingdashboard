import { useUiModeContext } from "@/lib/ui-mode-context";

/** 经典 | 终端 分段切换 — 两套壳各放一个；变体只决定配色 */
export function ModeToggle({ variant }: { variant: "classic" | "gmt" }) {
  const { mode, setMode } = useUiModeContext();
  if (variant === "gmt") {
    return (
      <span className="gmt-mode-toggle" role="group" aria-label="界面形态">
        <button type="button" className={mode === "classic" ? "on" : ""} onClick={() => setMode("classic")} title="切换到经典看板 [T]">
          经典
        </button>
        <button type="button" className={mode === "gmt" ? "on" : ""} onClick={() => setMode("gmt")} title="GMT 终端">
          终端
        </button>
      </span>
    );
  }
  const base = "px-2 py-1 text-[10px] transition-colors";
  return (
    <span className="flex overflow-hidden rounded border border-slate-700/60 bg-slate-800/40 font-mono" role="group" aria-label="界面形态">
      <button type="button" className={`${base} ${mode === "classic" ? "bg-[#f5c542] font-bold text-black" : "text-slate-400 hover:text-[#fde68a]"}`} onClick={() => setMode("classic")} title="经典看板">
        经典
      </button>
      <button type="button" className={`${base} ${mode === "gmt" ? "bg-[#f28c00] font-bold text-black" : "text-slate-400 hover:text-[#f28c00]"}`} onClick={() => setMode("gmt")} title="切换到 GMT 终端 [T]">
        终端
      </button>
    </span>
  );
}
