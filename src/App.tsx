import { useEffect, useMemo, useState } from "react";
import { Navigate, Routes, Route, useSearchParams } from "react-router";
import { TickerTape, type TapeItem } from "@/components/dash/TickerTape";
import { DashboardHeader } from "@/components/dash/DashboardHeader";
import { StarHint } from "@/components/dash/StarHint";
import { DashboardLayout, type PanelRowDef } from "@/components/dash/DashboardLayout";
import { IndexPanel } from "@/components/dash/IndexPanel";
import { CommodityPanel } from "@/components/dash/CommodityPanel";
import { TreasuryPanel } from "@/components/dash/TreasuryPanel";
import { SectorPanel } from "@/components/dash/SectorPanel";
import { MoneyFlowPanel } from "@/components/dash/MoneyFlowPanel";
import { RankPanel } from "@/components/dash/RankPanel";
import { BoardFlowPanel } from "@/components/dash/BoardFlowPanel";
import { NewsPanel } from "@/components/dash/NewsPanel";
import { ChainPanel } from "@/components/dash/ChainPanel";
import { WatchlistPanel } from "@/components/dash/WatchlistPanel";
import AiDashboard from "./AiDashboard";
import GoodsDashboard from "./GoodsDashboard";
import FinDashboard from "./FinDashboard";
import GoldDashboard from "./GoldDashboard";
import WatchDashboard from "./WatchDashboard";
import ProLanding from "./ProLanding";
import LoginPage from "./pages/LoginPage";
import HeatmapDemo from "./pages/HeatmapDemo";
import HeatmapDemoV2 from "./pages/HeatmapDemoV2";
import HeatmapDemoV3 from "./pages/HeatmapDemoV3";
import GmtFullDemo from "./pages/GmtFullDemo";
import { hostingEnabled, hostingToken } from "@/lib/hosting";
import { selfhostEnabled } from "@/lib/selfhost";
import { HostingContext, useHosting } from "@/lib/hosting-context";
import { SelfhostContext, useSelfhost } from "@/lib/selfhost-context";
import { BRAND } from "@/config/branding";
import { pageLinks } from "@/lib/nav";
import { useSharedPolling } from "@/hooks/useSharedPolling";
import { useQuotes } from "@/lib/market";
import { useFullscreen } from "@/hooks/useFullscreen";
import { api } from "@/lib/api";
import { POLL } from "@/lib/intervals";
import { INDICES, FOREX, COMMODITIES } from "@/config/dashboard";
import { TerminalProvider, useTerminal } from "@/lib/terminal-context";
import { useTerminalShortcuts } from "@/hooks/useTerminalShortcuts";
import { TerminalToolbar } from "@/components/terminal/TerminalToolbar";
import { TerminalHelp } from "@/components/terminal/TerminalHelp";
import { TerminalInspector } from "@/components/terminal/TerminalInspector";
import { TerminalStatusBar } from "@/components/terminal/TerminalStatusBar";
import { isTv } from "@/lib/tv";

function Tape() {
  const codes = useMemo(() => [...INDICES.map((i) => i.code), ...FOREX.map((i) => i.code)], []);
  const futureCodes = useMemo(() => COMMODITIES.map((c) => c.code), []);
  // 指数与期货报价: 统一报价中心(与全站所有面板同帧)
  const quotes = useQuotes(codes);
  const futures = useQuotes(futureCodes);
  const { data: treasuries } = useSharedPolling("treasuries", () => api.treasuries(), POLL.TREASURY_LIVE);

  const items: TapeItem[] = useMemo(() => {
    const list: TapeItem[] = [];
    for (const d of [...INDICES, ...FOREX]) {
      const q = quotes?.[d.code];
      if (q) list.push({ key: d.code, label: d.label, price: q.price, pct: q.pct });
    }
    for (const c of COMMODITIES) {
      const q = futures?.[c.code];
      if (q) list.push({ key: c.code, label: c.label, price: q.price, pct: q.pct });
    }
    for (const sym of ["US10Y", "US2Y"]) {
      const t = treasuries?.find((x) => x.symbol === sym);
      if (t)
        list.push({
          key: sym,
          label: `美债${sym.replace("US", "")}收益率`,
          price: t.yield,
          pct: t.yield ? (t.change / t.yield) * 100 : 0, // yield 缺失(接口异常归一为 0)时不产生 Infinity%
          digits: 3,
        });
    }
    return list;
  }, [quotes, futures, treasuries]);

  if (items.length === 0) return <div className="h-7 border-b border-slate-700/40 bg-[#0a101c]" />;
  return <TickerTape items={items} />;
}

const PANEL_ROWS: PanelRowDef[] = [
  {
    defaultH: 0.30,
    panels: [
      { id: "index", component: IndexPanel, defaultW: 0.25, mobileH: "h-[560px]" },
      { id: "sector", component: SectorPanel, defaultW: 0.4167, mobileH: "h-[560px]" },
      { id: "news", component: NewsPanel, defaultW: 0.3333, mobileH: "h-[560px]" },
    ],
  },
  {
    defaultH: 0.34,
    panels: [
      { id: "boardFlow", component: BoardFlowPanel, defaultW: 0.2, mobileH: "h-[340px]" },
      { id: "moneyFlow", component: MoneyFlowPanel, defaultW: 0.2, mobileH: "h-[340px]" },
      { id: "rank", component: RankPanel, defaultW: 0.2, mobileH: "h-[340px]" },
      { id: "commodity", component: CommodityPanel, defaultW: 0.2, mobileH: "h-[300px]" },
      { id: "treasury", component: TreasuryPanel, defaultW: 0.2, mobileH: "h-[340px]" },
    ],
  },
  {
    defaultH: 0.36,
    panels: [
      { id: "watchlist", component: WatchlistPanel, defaultW: 0.2222, mobileH: "h-[400px]" },
      { id: "chain", component: ChainPanel, defaultW: 0.7778, mobileH: "h-[560px]" },
    ],
  },
];

function HomeTerminalShortcuts() {
  const { toggleHelp, toggleEditMode, toggleInspector, setHelpOpen, setInspectorOpen, setEditMode, selectPanel } = useTerminal();
  useTerminalShortcuts({
    toggleHelp,
    toggleEditMode,
    toggleInspector,
    closeOverlays: () => {
      setHelpOpen(false);
      setInspectorOpen(false);
      setEditMode(false);
      selectPanel(null);
    },
  });
  return null;
}

function Dashboard() {
  const { isFullscreen, toggle } = useFullscreen();
  const hosting = useHosting();
  const selfhost = useSelfhost();
  const links = useMemo(() => {
    const extra = hosting || selfhost ? [] : [{ to: "/pro", label: "Pro" }];
    return pageLinks("/", extra);
  }, [hosting, selfhost]);

  return (
    <TerminalProvider>
      <HomeTerminalShortcuts />
      <div className="terminal-shell flex min-h-screen flex-col bg-[#070b12] text-slate-200 lg:h-screen lg:overflow-hidden">
        <DashboardHeader
          title={BRAND.title}
          subtitle={BRAND.subtitle}
          accent="gold"
          tagline={BRAND.tagline}
          linkTo="/ai"
          linkLabel="AI 观察"
          links={links}
          live
          githubUrl={selfhost ? undefined : "https://github.com/theBigGavin/marketingdashboard"}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggle}
        />
        {!isTv && <TerminalToolbar />}
        <Tape />
        {!selfhost && <StarHint githubUrl="https://github.com/theBigGavin/marketingdashboard" />}
        <div className={`relative flex min-h-0 flex-1 flex-col ${!isTv ? "md:mr-0" : ""}`}>
          <DashboardLayout rows={PANEL_ROWS} />
        </div>
        {!isTv && (
          <>
            <TerminalHelp />
            <TerminalInspector />
            <TerminalStatusBar />
          </>
        )}
      </div>
    </TerminalProvider>
  );
}

/** 托管模式上下文: HostingGate 探测结果(enabled) 复用同一次探测, 供 Dashboard/路由消费
 *  (定义在 src/lib/hosting-context.ts, 独立模块避免 AiDashboard ↔ App 循环依赖) */

function AppRoutes() {
  const hosting = useHosting();
  const selfhost = useSelfhost();
  const [params] = useSearchParams();
  if (params.get("demo") === "heatmap") return <HeatmapDemo />;
  if (params.get("demo") === "heatmap-v2") return <HeatmapDemoV2 />;
  if (params.get("demo") === "heatmap-v3") return <HeatmapDemoV3 />;
  if (params.get("demo") === "gmt-full") return <GmtFullDemo />;
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/watch" element={<WatchDashboard />} />
      <Route path="/ai" element={<AiDashboard />} />
      <Route path="/goods" element={<GoodsDashboard />} />
      <Route path="/gold" element={<GoldDashboard />} />
      <Route path="/fin" element={<FinDashboard />} />
      <Route path="/demo/heatmap" element={<Navigate to="/?demo=heatmap" replace />} />
      <Route path="/demo/heatmap-v2" element={<Navigate to="/?demo=heatmap-v2" replace />} />
      <Route path="/demo/heatmap-v3" element={<Navigate to="/?demo=heatmap-v3" replace />} />
      <Route path="/demo/gmt-full" element={<Navigate to="/?demo=gmt-full" replace />} />
      <Route path="/pro" element={hosting || selfhost ? <Navigate to="/" replace /> : <ProLanding />} />
    </Routes>
  );
}

export default function App() {
  return (
    <HostingGate>
      <AppRoutes />
    </HostingGate>
  );
}

/**
 * 托管版登录墙（运行时探测 /api/hosting/config）:
 * - 开源模式(端点 404): 直接渲染 children, 行为与以往完全一致(零回归)
 * - 托管模式(端点 enabled=true): 有 token → children(看板); 无 token → 登录页
 */
function HostingGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "open" | "login">("checking");
  const [hosting, setHosting] = useState(false);
  const [selfhost, setSelfhost] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      let enabled = false;
      let self = false;
      try {
        [enabled, self] = await Promise.all([hostingEnabled(), selfhostEnabled()]);
      } catch {
        enabled = false;
        self = false;
      }
      if (!alive) return;
      setHosting(enabled);
      setSelfhost(self);
      if (!enabled) { setState("open"); return; }
      setState(hostingToken() ? "open" : "login");
    })();
    return () => { alive = false; };
  }, []);
  // 托管模式: index.html 静态 footer 无业务价值 → 移除; 自部署保留个人页脚
  useEffect(() => {
    if (hosting) document.getElementById("mrd-foot")?.remove();
  }, [hosting]);
  // 自部署模式: 移除 Cloudflare Insights beacon(写在静态 index.html 里)
  useEffect(() => {
    if (!selfhost) return;
    document.querySelector('script[src*="cloudflareinsights.com"]')?.remove();
  }, [selfhost]);
  if (state === "checking") {
    return <div className="flex min-h-screen items-center justify-center bg-[#070b12] text-slate-500">加载中…</div>;
  }
  if (state === "login") {
    return <LoginPage onAuthed={() => setState("open")} />;
  }
  return (
    <HostingContext.Provider value={hosting}>
      <SelfhostContext.Provider value={selfhost}>{children}</SelfhostContext.Provider>
    </HostingContext.Provider>
  );
}
