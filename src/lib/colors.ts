// 图表/UI 统一色板 — 新增图表从这里取色, 不要内联 hex
// 涨跌语义色与 format.ts 的 clsChg 保持一致(涨红跌绿)

// 主序列色(多系列图表按序取) — 首色为暖金主色
export const SERIES = ["#f5c542", "#fb7185", "#fde68a", "#34d399", "#fbbf24", "#a78bfa", "#f59e0b", "#94a3b8"] as const;

// 主营构成堆叠段色(深色 CVD 验证: 蓝/橙/青/黄/品红 + 其他灰)
export const SEG_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#64748b"] as const;

// 涨/跌/平
export const UP = "#fb7185";
export const DOWN = "#34d399";
export const FLAT = "#94a3b8";

// 背景(任意值背景统一)
export const CHART_BG = "#0b1120";

// 网格/轴/刻度
export const GRID = "#1e293b";
export const AXIS = "#475569";
// 零轴(加粗)
export const ZERO = "#334155";

// 悬停十字线
export const CROSSHAIR = "#64748b";

// 排名奖牌色(金银铜)
export const RANK_GOLD = "#fbbf24";
export const RANK_SILVER = "#fb7185";
export const RANK_BRONZE = "#f5c542";

// 图表 tooltip 背景
export const TOOLTIP_BG = "#0b1120";
