import { DashboardHeader } from "@/components/dash/DashboardHeader";
import { AiGrid } from "@/components/dash/AiGrid";
import { OpenRouterPanel } from "@/components/dash/OpenRouterPanel";
import { TtsiTrendPanel, EventPanel, ModelPricePanel, ValueScatterPanel } from "@/components/dash/ModelCostPanel";
import { InfraRoiPanel } from "@/components/dash/InfraRoiPanel";
import { useFullscreen } from "@/hooks/useFullscreen";

// 3×2 网格: Token 消耗压缩为左上单格, 新面板(基础设施ROI)放左下空区
const CELLS = [
  {
    id: "openrouter",
    component: OpenRouterPanel,
    area: "lg:col-start-1 lg:row-start-1",
    mobileH: "h-[360px]",
  },
  { id: "ttsi-trend", component: TtsiTrendPanel, area: "lg:col-start-2 lg:row-start-1", mobileH: "h-[380px]" },
  { id: "price-events", component: EventPanel, area: "lg:col-start-3 lg:row-start-1", mobileH: "h-[380px]" },
  { id: "ai-infra", component: InfraRoiPanel, area: "lg:col-start-1 lg:row-start-2", mobileH: "h-[340px]" },
  { id: "price-table", component: ModelPricePanel, area: "lg:col-start-2 lg:row-start-2", mobileH: "h-[380px]" },
  { id: "value-scatter", component: ValueScatterPanel, area: "lg:col-start-3 lg:row-start-2", mobileH: "h-[380px]" },
];

export default function AiDashboard() {
  const { isFullscreen, toggle } = useFullscreen();

  return (
    <div className="flex min-h-screen flex-col bg-[#070b12] text-slate-200 lg:h-screen lg:overflow-hidden">
      <DashboardHeader
        title="人工智能行业观察"
        subtitle="AI INDUSTRY WATCH"
        accent="violet"
        tagline="AI Token 消耗 · 模型排名 · 厂商份额"
        linkTo="/"
        linkLabel="市场驾驶舱"
        linkBack
        links={[
          { to: "/", label: "市场驾驶舱" },
          { to: "/goods", label: "商品价格" },
          { to: "/fin", label: "财报窗口" },
        ]}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggle}
      />
      <AiGrid cells={CELLS} />
    </div>
  );
}
