// 轮询间隔统一常量 — 新增面板时从这里取值, 不要手写魔法数字
// 口径说明:
//   QUOTE      = 5s   报价中心(与后端 q: 缓存 TTL 对齐)
//   MINUTE     = 60s  分时图(后端 5s TTL, 前端降频避免无谓重绘)
//   STOCK_FLOW = 30s  个股资金流
//   NEWS       = 20s  快讯
//   FIN        = 30min 财报数据(后端 1h 缓存, 前端半频)
//   AA_MODELS  = 1h   AI 模型定价(后端 24h 缓存)
//   SPOT       = 1h   现货表(后端 8h 缓存)
//   TREASURY   = 1h   美债(后端 30s 缓存, 前端低频)
export const POLL = {
  QUOTE: 5000,
  MINUTE: 60000,
  STOCK_FLOW: 30000,
  NEWS: 20000,
  FIN: 1800000,
  AA_MODELS: 3600000,
  SPOT: 3600000,
  TREASURY: 3600000,
} as const;
