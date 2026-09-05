/** 主驾驶舱面板元数据 — 供终端检查器展示来源/口径 */
export interface PanelMeta {
  id: string;
  title: string;
  source: string;
  refresh: string;
  note: string;
}

export const HOME_PANEL_REGISTRY: Record<string, PanelMeta> = {
  index: { id: "index", title: "全球关键指数", source: "腾讯行情 · /api/quotes", refresh: "5s", note: "沪深港美主要指数与汇率" },
  sector: { id: "sector", title: "板块热点", source: "腾讯板块榜 · /api/boards", refresh: "5s", note: "行业/概念板块涨跌排行" },
  news: { id: "news", title: "7×24 快讯", source: "华尔街见闻 · /api/news", refresh: "8s", note: "全球财经滚动新闻" },
  boardFlow: { id: "boardFlow", title: "板块资金流", source: "东财 · /api/board-flow", refresh: "2min", note: "行业板块累计主力净流入曲线" },
  moneyFlow: { id: "moneyFlow", title: "主力净流入", source: "东财/新浪 · /api/moneyflow", refresh: "8s", note: "个股主力净流入排行" },
  rank: { id: "rank", title: "涨跌排行", source: "腾讯 · /api/rank", refresh: "5s", note: "涨幅/成交额/换手率榜单" },
  commodity: { id: "commodity", title: "大宗商品", source: "新浪期货 · /api/futures", refresh: "15s", note: "金银铜油等期货报价" },
  treasury: { id: "treasury", title: "美债收益率", source: "CNBC · /api/treasuries", refresh: "30s", note: "10Y/2Y 收益率与利差" },
  watchlist: { id: "watchlist", title: "自选股", source: "腾讯行情 · MarketHub", refresh: "5s", note: "本地/托管自选股列表" },
  chain: { id: "chain", title: "产业链全景", source: "行情 + 可选问财 · /api/mystery-select", refresh: "5s", note: "上中下游标的联动报价" },
};
