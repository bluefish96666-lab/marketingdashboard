import { useMemo } from "react";
import { usePolling } from "@/hooks/usePolling";
import { api } from "@/lib/api";
import { normalizeStockCode } from "@/lib/code";
import { clsChg, fmtPct, fmtPrice, fmtYuan } from "@/lib/format";
import { POLL } from "@/lib/intervals";
import { Spark } from "@/components/dash/Spark";
import { tileLabel } from "@/components/dash/heatmap/heatmap-shared";
import { useGmtDemo } from "../gmt-context";

/** 04 — 选中标的 · 分时 */
export function GmtChartWidget() {
  const { selected } = useGmtDemo();
  const code = selected ? normalizeStockCode(selected.code) : "";

  const { data: minute } = usePolling(
    () => (code ? api.minute(code) : Promise.resolve(null)),
    POLL.SECTOR,
    [code]
  );

  const spark = useMemo(() => {
    if (!minute || minute.points.length < 2) return null;
    return { points: minute.points, prec: minute.prec };
  }, [minute]);

  if (!selected) {
    return (
      <div className="gmt-insp-empty flex h-full items-center justify-center px-4 text-center">
        在 01 热力图点击个股，此处显示分时走势与报价摘要。
      </div>
    );
  }

  return (
    <>
      <div className="gmt-chart-stats">
        <span>
          <b style={{ color: "var(--gmt-amber)" }}>{tileLabel(selected.code)}</b> {selected.name}
        </span>
        <span className={clsChg(selected.pct)}>{fmtPrice(selected.price)}</span>
        <span className={clsChg(selected.pct)}>{fmtPct(selected.pct)}</span>
        <span>流通 {selected.circMv.toFixed(0)}亿</span>
        <span>额 {fmtYuan(selected.amount)}</span>
        {minute?.degraded && <span style={{ color: "var(--gmt-amber)" }}>分时降级</span>}
      </div>
      <div className="gmt-chart-area">
        <Spark
          points={spark?.points ?? []}
          prec={spark?.prec ?? selected.price}
          fluid
          width={400}
          height={160}
          session="ashare"
          emptyLabel={minute?.degraded ? "分时暂不可用" : "加载中…"}
        />
      </div>
    </>
  );
}
