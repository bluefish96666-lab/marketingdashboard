// 轮询间隔统一常量 — 新增面板时从这里取值, 不要手写魔法数字
// 口径说明:
//   MINUTE        = 60s   分时图(后端 5s TTL, 前端降频避免无谓重绘)
//   STOCK_FLOW    = 30s   个股资金流
//   NEWS          = 20s   快讯
//   MONEYFLOW     = 20s   个股主力净流入榜单(东财口径)
//   RANK          = 15s   个股榜单(热门/涨幅/跌幅)
//   SECTOR        = 15s   板块榜 / 板块成分股
//   CHAIN_BOARDS  = 25s   产业链面板关联板块
//   FIN           = 30min 财报数据(后端 1h 缓存, 前端半频)
//   TREASURY      = 1h    美债历史(后端 30s 缓存, 前端低频)
//   TREASURY_LIVE = 60s   美债实时收益率(顶部跑马灯 + 面板共享)
//   AA_MODELS     = 1h    AI 模型定价(后端 24h 缓存)
//   SPOT          = 1h    现货表(后端 8h 缓存)
export const POLL = {
  MINUTE: 60000,
  STOCK_FLOW: 30000,
  NEWS: 20000,
  MONEYFLOW: 20000,
  RANK: 15000,
  SECTOR: 15000,
  CHAIN_BOARDS: 25000,
  FIN: 1800000,
  TREASURY: 3600000,
  TREASURY_LIVE: 60000,
  AA_MODELS: 3600000,
  SPOT: 3600000,
} as const;
