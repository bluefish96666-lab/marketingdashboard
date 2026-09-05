import { BRAND } from "@/config/branding";

export function TerminalStatusBar() {
  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  return (
    <footer className="terminal-status flex h-6 shrink-0 items-center justify-between border-t border-slate-700/40 bg-[#080c10] px-2 font-mono text-[9px] text-slate-600">
      <span>
        <span className="text-emerald-500/90">●</span> 实时行情 · 本地代理聚合
      </span>
      <span className="truncate px-2 text-slate-700">{BRAND.motto}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>as-of {ts}</span>
    </footer>
  );
}
