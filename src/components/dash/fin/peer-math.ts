// 同业对比计算 — 纯函数, 与渲染分离(可单测)
// 返回裸数值(行业/均值/排名/usePrev 降级/雷达归一化), 字符串格式化留在 FinPeerPanel 渲染层
import type { FinanceBoard, FinanceMain } from "@/lib/api";

/** 计算前一个报告期(用于全市场完整数据的同业对比降级) */
export function prevPeriodFn(p: string): string {
  const y = parseInt(p.slice(0, 4));
  const md = p.slice(4);
  const map: Record<string, string> = { "-03-31": "-12-31", "-06-30": "-03-31", "-09-30": "-06-30", "-12-31": "-09-30" };
  return `${md === "-03-31" ? y - 1 : y}${map[md] || "-06-30"}`;
}

export type PeerMetricKey = "np" | "py" | "ry" | "roe" | "eps";

/** 单项对比(裸数值): 公司值/行业均值/排名 + 比较条值 */
export interface PeerMetric {
  key: PeerMetricKey;
  label: string;
  /** 文本数值(净利取报表值) */
  companyVal: number;
  /** 行业均值(null = 无同业) */
  peerAvg: number | null;
  /** 1 起排(null = 未入榜或降级期不可排) */
  rank: number | null;
  /** 比较条公司值(净利取入榜快照值, 与文本值分离) */
  barVal: number;
  /** 比较条行业均值 */
  barAvg: number;
}

/** 雷达轴(归一化 0-1) */
export interface PeerRadarAxis {
  label: string;
  company: number;
  peer: number;
}

/** 同业对比结果(裸数值) */
export interface PeerComparison {
  industry: string | null;
  count: number;
  inBoard: boolean;
  usePrev: boolean;
  metrics: PeerMetric[];
  radar: PeerRadarAxis[];
}

/**
 * 同业对比: 公司指标 vs 行业均值/排名 + 雷达归一化。
 * 当期 peer 太少(<3)时降级使用上一期全市场数据(usePrev), 降级期不排位。
 * 无入榜公司且无行业信息时返回空结果(industry null)。
 */
export function computePeerComparison(
  board: FinanceBoard | null | undefined,
  prevBoard: FinanceBoard | null | undefined,
  finData: FinanceMain | null | undefined,
  companyCode: string,
  companyName: string,
): PeerComparison | null {
  if (!board?.stocks?.length || !finData?.reports?.[0]) return null;
  const bare = companyCode.replace(/^(sh|sz|bj)/, "");
  let companyInBoard = board.stocks.find(
    (s) => s.code === bare || s.code === companyCode || s.code === `${bare}.${companyCode.startsWith("sh") ? "SH" : companyCode.startsWith("sz") ? "SZ" : "BJ"}`
  );
  if (!companyInBoard) {
    companyInBoard = board.stocks.find((s) => s.name === companyName || s.name === finData.name);
  }
  const finIndustry = finData.industry || "";

  if (!companyInBoard && !finIndustry) return { industry: null, count: 0, inBoard: false, usePrev: false, metrics: [], radar: [] };

  const industry = companyInBoard?.industry || finIndustry;
  const curPeers = board.stocks.filter((s) => s.industry === industry);

  // 当期 peer 太少(<3)时降级使用上一期全市场数据
  const usePrev = curPeers.length < 3 && !!prevBoard?.stocks?.length;
  const peerSource = usePrev && prevBoard ? prevBoard : board;
  const peers = peerSource.stocks.filter((s) => s.industry === industry);
  const count = peers.length;
  const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const rank = (arr: number[], val: number) => arr.filter((v) => v > val).length + 1;

  const peerNp = peers.map((s) => s.netProfit);
  const peerPy = peers.map((s) => s.profitYoY);
  const peerRy = peers.map((s) => s.revenueYoY);
  const peerRoe = peers.map((s) => s.roe);
  const peerEps = peers.map((s) => s.eps);

  const r0 = finData.reports[0];
  const cmpNp = companyInBoard ? companyInBoard.netProfit : r0.netProfit;
  const cmpPy = companyInBoard ? companyInBoard.profitYoY : r0.profitYoY;
  const cmpRy = companyInBoard ? companyInBoard.revenueYoY : r0.revenueYoY;
  const cmpRoe = companyInBoard ? companyInBoard.roe : r0.roe;
  const cmpEps = companyInBoard ? companyInBoard.eps : r0.eps;

  const rankable = !!companyInBoard && !usePrev;

  const metrics: PeerMetric[] = [
    { key: "np", label: "净利", companyVal: r0.netProfit, peerAvg: count > 0 ? avg(peerNp) : null, rank: rankable ? rank(peerNp, cmpNp) : null, barVal: cmpNp, barAvg: avg(peerNp) },
    { key: "py", label: "净利增速", companyVal: cmpPy, peerAvg: count > 0 ? avg(peerPy) : null, rank: rankable ? rank(peerPy, cmpPy) : null, barVal: cmpPy, barAvg: avg(peerPy) },
    { key: "ry", label: "营收增速", companyVal: cmpRy, peerAvg: count > 0 ? avg(peerRy) : null, rank: rankable ? rank(peerRy, cmpRy) : null, barVal: cmpRy, barAvg: avg(peerRy) },
    { key: "roe", label: "ROE", companyVal: cmpRoe, peerAvg: count > 0 ? avg(peerRoe) : null, rank: rankable ? rank(peerRoe, cmpRoe) : null, barVal: cmpRoe, barAvg: avg(peerRoe) },
    { key: "eps", label: "EPS", companyVal: cmpEps, peerAvg: count > 0 ? avg(peerEps) : null, rank: rankable ? rank(peerEps, cmpEps) : null, barVal: cmpEps, barAvg: avg(peerEps) },
  ];

  // 雷达归一化 0-1: 公司值/行业均值相对各自绝对最大值的比例, 保底 0.02
  const radar: PeerRadarAxis[] = metrics.map((m) => {
    const max = Math.max(Math.abs(m.barVal), Math.abs(m.barAvg), 1);
    return {
      label: m.label,
      company: Math.max(m.barVal / max, 0.02),
      peer: Math.max(m.barAvg / max, 0.02),
    };
  });

  return { industry, count, inBoard: !!companyInBoard, usePrev, metrics, radar };
}
