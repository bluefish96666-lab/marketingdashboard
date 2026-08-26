import { api, type Board, type BoardStock } from "@/lib/api";

export interface HeatStock {
  code: string;
  name: string;
  pct: number;
  price: number;
  circMv: number; // 流通市值(亿)
  amount: number; // 成交额(元)
}

export interface HeatGroup {
  id: string;
  name: string;
  avgPct: number;
  stocks: HeatStock[];
}

export type AreaMode = "mcap" | "turnover";
export type MoversFilter = "ALL" | "UP" | "DOWN";

const BOARD_N = 6;
const STOCKS_PER_BOARD = 24;

function toHeatStock(s: BoardStock): HeatStock {
  return {
    code: s.code,
    name: s.name,
    pct: s.pct,
    price: s.price,
    circMv: s.circ_mv,
    amount: s.amount,
  };
}

async function loadBoardGroup(board: Board): Promise<HeatGroup> {
  const raw = await api.boardStocks(board.code, STOCKS_PER_BOARD);
  const stocks = (raw ?? [])
    .map(toHeatStock)
    .filter((s) => s.circMv > 0 || s.amount > 0)
    .sort((a, b) => b.circMv - a.circMv);
  const avgPct = stocks.length
    ? stocks.reduce((a, s) => a + s.pct, 0) / stocks.length
    : board.pct;
  return { id: board.code, name: board.name, avgPct, stocks };
}

/** 拉取领涨行业 Top N 板块 + 成分股(方案 A demo 数据源) */
export async function fetchHeatmapGroups(): Promise<HeatGroup[]> {
  const boards = await api.boards("01", 0, BOARD_N + 2);
  if (!boards?.length) return MOCK_HEAT_GROUPS;
  const top = boards.slice(0, BOARD_N);
  const groups = await Promise.all(top.map(loadBoardGroup));
  return groups.filter((g) => g.stocks.length > 0);
}

/** 离线/接口失败时的演示数据 */
export const MOCK_HEAT_GROUPS: HeatGroup[] = [
  {
    id: "demo-ai",
    name: "AI·算力",
    avgPct: 2.14,
    stocks: [
      { code: "300308", name: "中际旭创", pct: 4.82, price: 168.5, circMv: 1850, amount: 4.2e9 },
      { code: "002230", name: "科大讯飞", pct: 3.21, price: 52.3, circMv: 980, amount: 2.1e9 },
      { code: "688256", name: "寒武纪", pct: 5.67, price: 612.0, circMv: 720, amount: 3.8e9 },
      { code: "603019", name: "中科曙光", pct: 2.45, price: 58.9, circMv: 650, amount: 1.5e9 },
      { code: "300474", name: "景嘉微", pct: 1.88, price: 89.2, circMv: 420, amount: 0.9e9 },
      { code: "002415", name: "海康威视", pct: -0.32, price: 31.5, circMv: 2100, amount: 1.2e9 },
      { code: "300496", name: "中科创达", pct: -1.24, price: 48.6, circMv: 180, amount: 0.4e9 },
      { code: "688041", name: "海光信息", pct: 3.95, price: 128.0, circMv: 890, amount: 2.6e9 },
    ],
  },
  {
    id: "demo-semi",
    name: "半导体",
    avgPct: 1.68,
    stocks: [
      { code: "688981", name: "中芯国际", pct: 2.11, price: 52.8, circMv: 3200, amount: 3.1e9 },
      { code: "603501", name: "韦尔股份", pct: 3.45, price: 108.2, circMv: 1100, amount: 1.8e9 },
      { code: "688012", name: "中微公司", pct: -2.88, price: 156.0, circMv: 680, amount: 1.1e9 },
      { code: "002371", name: "北方华创", pct: 1.02, price: 398.0, circMv: 1450, amount: 2.2e9 },
      { code: "688008", name: "澜起科技", pct: 4.21, price: 72.5, circMv: 520, amount: 1.4e9 },
      { code: "603986", name: "兆易创新", pct: -0.85, price: 98.3, circMv: 480, amount: 0.7e9 },
    ],
  },
  {
    id: "demo-ne",
    name: "新能源",
    avgPct: -0.42,
    stocks: [
      { code: "300750", name: "宁德时代", pct: -1.24, price: 198.5, circMv: 6800, amount: 5.2e9 },
      { code: "002594", name: "比亚迪", pct: 0.88, price: 268.0, circMv: 5200, amount: 4.1e9 },
      { code: "601012", name: "隆基绿能", pct: -2.15, price: 18.6, circMv: 980, amount: 1.3e9 },
      { code: "300274", name: "阳光电源", pct: 1.56, price: 72.8, circMv: 850, amount: 1.6e9 },
      { code: "688599", name: "天合光能", pct: -3.42, price: 22.1, circMv: 320, amount: 0.5e9 },
    ],
  },
  {
    id: "demo-bank",
    name: "银行",
    avgPct: 0.35,
    stocks: [
      { code: "601398", name: "工商银行", pct: 0.42, price: 5.82, circMv: 12000, amount: 2.8e9 },
      { code: "601288", name: "农业银行", pct: 0.28, price: 4.95, circMv: 9800, amount: 1.9e9 },
      { code: "600036", name: "招商银行", pct: 0.65, price: 38.2, circMv: 6200, amount: 2.1e9 },
      { code: "601166", name: "兴业银行", pct: -0.18, price: 18.5, circMv: 2800, amount: 0.8e9 },
      { code: "000001", name: "平安银行", pct: 0.12, price: 12.8, circMv: 2100, amount: 0.6e9 },
    ],
  },
];

export function areaVal(s: HeatStock, mode: AreaMode): number {
  return mode === "mcap" ? Math.max(s.circMv, 0.01) : Math.max(s.amount, 1);
}

export function filterGroups(
  groups: HeatGroup[],
  movers: MoversFilter,
  query: string
): HeatGroup[] {
  const q = query.trim().toUpperCase();
  return groups
    .map((g) => {
      let stocks = g.stocks;
      if (movers === "UP") stocks = stocks.filter((s) => s.pct > 0);
      if (movers === "DOWN") stocks = stocks.filter((s) => s.pct < 0);
      if (q) stocks = stocks.filter((s) => s.code.includes(q) || s.name.toUpperCase().includes(q));
      if (!stocks.length) return null;
      const avgPct = stocks.reduce((a, s) => a + s.pct, 0) / stocks.length;
      return { ...g, stocks, avgPct };
    })
    .filter((g): g is HeatGroup => g != null);
}
