/** V4 — Kimi 风格全页 GMT 终端 · /?demo=gmt-full */
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

function GmtFullDemoInner() {
  useEffect(() => {
    document.title = "GMT 全页终端 · Preview V4";
    return () => {
      document.title = "老孙的交易台";
    };
  }, []);

  return (
    <>
      <GmtDataLoader />
      <GmtTerminalShell />
    </>
  );
}

export default function GmtFullDemo() {
  return (
    <GmtDemoProvider>
      <GmtFullDemoInner />
    </GmtDemoProvider>
  );
}
