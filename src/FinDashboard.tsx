import { DashboardHeader } from "@/components/dash/DashboardHeader";
import {
  DashboardLayout,
  type PanelRowDef,
} from "@/components/dash/DashboardLayout";
import { FinProvider } from "@/components/dash/fin/FinContext";
import { FinCalendarPanel } from "@/components/dash/fin/FinCalendarPanel";
import { FinForecastPanel } from "@/components/dash/fin/FinForecastPanel";
import { FinIndustryPanel } from "@/components/dash/fin/FinIndustryPanel";
import { FinStockRankPanel } from "@/components/dash/fin/FinStockRankPanel";
import { FinCompanyPanel } from "@/components/dash/fin/FinCompanyPanel";
import { FinTrendPanel } from "@/components/dash/fin/FinTrendPanel";
import { useFullscreen } from "@/hooks/useFullscreen";

const PANEL_ROWS: PanelRowDef[] = [
  {
    defaultH: 0.4,
    panels: [
      {
        id: "finCalendar",
        component: FinCalendarPanel,
        defaultW: 0.38,
        mobileH: "h-[300px]",
      },
      {
        id: "finForecast",
        component: FinForecastPanel,
        defaultW: 0.38,
        mobileH: "h-[340px]",
      },
      {
        id: "finIndustry",
        component: FinIndustryPanel,
        defaultW: 0.5,
        mobileH: "h-[360px]",
      },
      {
        id: "finStockRank",
        component: FinStockRankPanel,
        defaultW: 0.5,
        mobileH: "h-[400px]",
      },
    ],
  },
  {
    defaultH: 0.6,
    panels: [
      {
        id: "finCompany",
        component: FinCompanyPanel,
        defaultW: 0.5,
        mobileH: "h-[380px]",
      },
      {
        id: "finTrend",
        component: FinTrendPanel,
        defaultW: 0.5,
        mobileH: "h-[360px]",
      },
    ],
  },
];

export default function FinDashboard() {
  const { isFullscreen, toggle } = useFullscreen();

  return (
    <div className="flex min-h-screen flex-col bg-[#070b12] text-slate-200 lg:h-screen lg:overflow-hidden">
      <DashboardHeader
        title="财报窗口"
        subtitle="EARNINGS WINDOW"
        accent="cyan"
        tagline="财报日历 · 业绩预告 · 盈利榜 · 公司趋势"
        linkTo="/"
        linkLabel="市场驾驶舱"
        linkBack
        links={[
          { to: "/", label: "市场驾驶舱" },
          { to: "/ai", label: "AI 观察" },
          { to: "/goods", label: "商品价格" },
        ]}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggle}
      />
      <FinProvider>
        <DashboardLayout rows={PANEL_ROWS} />
      </FinProvider>
    </div>
  );
}
