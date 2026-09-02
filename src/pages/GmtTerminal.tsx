/** GMT 终端（首页 mode=gmt 形态）— K3 对齐版 */
import { useEffect } from "react";
import { usePolling } from "@/hooks/usePolling";
import { fetchChainHeatmapGroups, MOCK_HEAT_GROUPS } from "@/lib/heatmap-data";
import { POLL } from "@/lib/intervals";
import { GmtDemoProvider, useGmtDemo } from "@/components/gmt/gmt-context";
import { GmtTerminalShell } from "@/components/gmt/GmtTerminalShell";

function GmtDataLoader() {
  const { setGroups, reportSource } = useGmtDemo();

  usePolling(
    async () => {
      try {
        const g = await fetchChainHeatmapGroups();
        const live = g.length > 0;
        setGroups(live ? g : MOCK_HEAT_GROUPS);
        reportSource("heatmap", "热力矩阵 · 产业链报价", live, g.reduce((a, x) => a + x.stocks.length, 0));
      } catch {
        setGroups(MOCK_HEAT_GROUPS);
        reportSource("heatmap", "热力矩阵 · 产业链报价", false, 0);
      }
      return null;
    },
    POLL.SECTOR,
    [setGroups, reportSource]
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
