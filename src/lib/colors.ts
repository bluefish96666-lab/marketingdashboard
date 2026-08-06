// 图表/UI 统一色板 — 新增图表从这里取色, 不要内联 hex
// 涨跌语义色与 format.ts 的 clsChg 保持一致(涨红跌绿)

// 主序列色(多系列图表按序取)
export const SERIES = ["#22d3ee", "#fb7185", "#38bdf8", "#34d399", "#fbbf24", "#a78bfa", "#f5c542", "#94a3b8"] as const;

// 涨/跌/平
export const UP = "#fb7185";
export const DOWN = "#22d3ee";
export const FLAT = "#94a3b8";

// 背景(任意值背景统一)
export const CHART_BG = "#0b1120";

// 网格/轴/刻度
export const GRID = "#1e293b";
export const AXIS = "#475569";

// 悬停十字线
export const CROSSHAIR = "#64748b";

// 排名奖牌色(金银铜)
export const RANK_GOLD = "#fbbf24";
export const RANK_SILVER = "#fb7185";
export const RANK_BRONZE = "#22d3ee";

// 图表 tooltip 背景
export const TOOLTIP_BG = "#0b1120";
