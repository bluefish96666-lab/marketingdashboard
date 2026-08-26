/**
 * 方案 A Demo — 独立热力矩阵预览页
 * 访问 /?demo=heatmap （/demo/heatmap 会重定向到此）
 */
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { HeatmapPanel } from "@/components/dash/HeatmapPanel";
import { BRAND } from "@/config/branding";

export default function HeatmapDemo() {
  return (
    <div className="flex min-h-screen flex-col bg-black text-slate-200 lg:h-screen lg:overflow-hidden">
      <header className="flex h-9 shrink-0 items-center gap-3 border-b border-[#292929] bg-gradient-to-r from-[#1a1000] via-[#0f0d08] to-[#1a1000] px-3">
        <Link
          to="/"
          className="inline-flex items-center gap-1 rounded border border-slate-700/60 px-2 py-0.5 text-[10px] text-slate-400 hover:border-[#f5c542]/50 hover:text-[#fde68a]"
        >
          <ArrowLeft size={10} />
          返回交易台
        </Link>
        <h1 className="font-mono text-[12px] font-bold text-[#fde68a]">
          {BRAND.terminalPrefix}
          <span className="text-slate-600">//</span>
          热力矩阵 Demo
          <span className="ml-2 text-[9px] font-normal text-slate-500">方案 A · 独立面板</span>
        </h1>
        <span className="ml-auto rounded border border-[#f5c542]/30 bg-[#f5c542]/10 px-2 py-0.5 text-[9px] text-[#fde68a]">
          PREVIEW
        </span>
      </header>
      <main className="min-h-0 flex-1 p-1">
        <HeatmapPanel className="h-full" demo panelId="heatmap-demo" panelLabel="01" />
      </main>
      <footer className="shrink-0 border-t border-[#292929] px-3 py-1 text-center text-[9px] text-slate-600">
        演示页 — 确认效果后再合入主驾驶舱 · 快捷键：悬停看 tooltip · 点击色块看详情 · 「其他」可下钻
      </footer>
    </div>
  );
}
