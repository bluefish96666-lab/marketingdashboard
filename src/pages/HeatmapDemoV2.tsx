/** V2 — GMT 琥珀终端复刻 · /?demo=heatmap-v2 */
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { HeatmapGmtWidget } from "@/components/dash/heatmap/HeatmapGmtWidget";

export default function HeatmapDemoV2() {
  return (
    <div className="flex min-h-screen flex-col bg-black lg:h-screen lg:overflow-hidden">
      <header
        className="flex h-[34px] shrink-0 items-center gap-3 px-3"
        style={{ background: "linear-gradient(180deg,#F28C00 0%,#E07F00 100%)", color: "#000" }}
      >
        <Link
          to="/"
          className="inline-flex items-center gap-1 border border-black/45 bg-black/10 px-2 py-0.5 font-mono text-[10px] font-semibold hover:bg-black hover:text-[#F28C00]"
        >
          <ArrowLeft size={10} />
          返回
        </Link>
        <span className="font-mono text-[13px] font-bold tracking-wide">
          GMT<b style={{ opacity: 0.55 }}>//</b>热力矩阵
        </span>
        <span className="font-mono text-[10px] opacity-70">v2 · 琥珀复刻</span>
        <span className="ml-auto bg-black px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-[#F28C00]">
          PREVIEW V2
        </span>
      </header>
      <main className="min-h-0 flex-1 p-2">
        <HeatmapGmtWidget className="h-full" />
      </main>
    </div>
  );
}
