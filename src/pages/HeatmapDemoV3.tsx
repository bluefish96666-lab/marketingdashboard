/** V3 — 老孙金终端 + 检查器侧栏 · /?demo=heatmap-v3 */
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { HeatmapLstWidget } from "@/components/dash/heatmap/HeatmapLstWidget";

export default function HeatmapDemoV3() {
  return (
    <div className="flex min-h-screen flex-col bg-black lg:h-screen lg:overflow-hidden">
      <div className="absolute left-2 top-[38px] z-50">
        <Link
          to="/"
          className="inline-flex items-center gap-1 border border-[#3a3a3a] bg-black/90 px-2 py-0.5 font-mono text-[9px] text-[#8a8a8a] hover:border-[#f5c542] hover:text-[#f5c542]"
        >
          <ArrowLeft size={9} />
          返回交易台
        </Link>
      </div>
      <span className="absolute right-2 top-[38px] z-50 border border-[#f5c542]/40 bg-black px-2 py-0.5 font-mono text-[9px] text-[#f5c542]">
        PREVIEW V3
      </span>
      <HeatmapLstWidget className="h-full min-h-0 flex-1" />
    </div>
  );
}
