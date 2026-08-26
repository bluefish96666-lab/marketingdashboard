/** 站点品牌 — 改名字/标语/主色只动这一处 */
export const BRAND = {
  /** GMT 风格终端前缀 */
  terminalPrefix: "LST",
  version: "2.0",
  title: "老孙的交易台",
  subtitle: "CINDY DESK",
  shortName: "老孙台",
  motto: "我乃老孙，老孙来了！",
  tagline: "我乃老孙，老孙来了！ · 沪深港美 · 大宗 · 板块 · 资金流",
  homeNavLabel: "交易台",
  description:
    "老孙的私人行情看板：沪深港美指数、大宗商品、美债收益率、板块热点、资金流向、7x24 快讯与产业链自选股。",
} as const;

/** 暖金主色 */
export const ACCENT = {
  primary: "#f5c542",
  light: "#fde68a",
  muted: "#fbbf24",
  dark: "#d4a017",
  gradientStart: "#fde68a",
  gradientEnd: "#f59e0b",
  glow: "rgba(245, 197, 66, 0.45)",
  glowSoft: "rgba(245, 197, 66, 0.18)",
  ring: "rgba(245, 197, 66, 0.4)",
} as const;
