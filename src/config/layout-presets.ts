/** GMT 风格布局预设 — 控制主驾驶舱可见面板 */
export type LayoutPresetId = "full" | "macro" | "flow" | "chain";

export interface LayoutPreset {
  id: LayoutPresetId;
  label: string;
  /** 隐藏的面板 id(未列出即显示) */
  hidden: string[];
  /** 进入预设时自动放大的面板(可选) */
  focus?: string;
}

export const HOME_LAYOUT_PRESETS: LayoutPreset[] = [
  { id: "full", label: "全屏", hidden: [] },
  { id: "macro", label: "宏观", hidden: ["boardFlow", "moneyFlow", "rank", "watchlist", "chain"], focus: "index" },
  { id: "flow", label: "资金", hidden: ["index", "news", "commodity", "treasury", "watchlist", "chain"], focus: "moneyFlow" },
  { id: "chain", label: "产业链", hidden: ["index", "sector", "news", "boardFlow", "moneyFlow", "rank", "commodity", "treasury"], focus: "chain" },
];

export function presetById(id: LayoutPresetId): LayoutPreset {
  return HOME_LAYOUT_PRESETS.find((p) => p.id === id) ?? HOME_LAYOUT_PRESETS[0];
}
