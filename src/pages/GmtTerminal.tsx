/** GMT 终端（首页 mode=gmt 形态）— K3 对齐版 */
import { useEffect } from "react";
import { usePolling } from "@/hooks/usePolling";
import { fetchChainHeatmapGroups, fetchHeatmapGroups, MOCK_HEAT_GROUPS } from "@/lib/heatmap-data";
import { POLL } from "@/lib/intervals";
import { GmtDemoProvider, useGmtDemo } from "@/components/gmt/gmt-context";
import { GmtTerminalShell } from "@/components/gmt/GmtTerminalShell";

function GmtDataLoader() {
  const { setGroups, reportSource, heatMode } = useGmtDemo();

  usePolling(
    async () => {
      const label = heatMode === "industry" ? "热力矩阵 · 申万行业" : "热力矩阵 · 产业链";
      try {
        const g = heatMode === "industry" ? await fetchHeatmapGroups() : await fetchChainHeatmapGroups();
        const live = g.length > 0;
        setGroups(live ? g : MOCK_HEAT_GROUPS);
        reportSource("heatmap", label, live, g.reduce((a, x) => a + x.stocks.length, 0));
      } catch {
        setGroups(MOCK_HEAT_GROUPS);
        reportSource("heatmap", label, false, 0);
      }
      return null;
    },
    POLL.SECTOR,
    [setGroups, reportSource, heatMode]
  );

  return null;
}

export default function GmtTerminal() {
  useEffect(() => {
    const prev = document.title;
    document.title = "GMT//老孙的交易台 · 终端";
    document.body.classList.add("gmt-active");
    return () => {
      document.title = prev;
      document.body.classList.remove("gmt-active");
    };
  }, []);

  return (
    <GmtDemoProvider>
      <GmtDataLoader />
      <GmtTerminalShell />
    </GmtDemoProvider>
  );
}
