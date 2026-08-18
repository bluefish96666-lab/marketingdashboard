// mrd 托管版 · 托管层入口
// 由 server/index.cjs 在 HOSTING=1 时加载: 打开账号 SQLite(server/data/hosting.db,
// gitignored 运行时数据), 生成托管路由表挂载进 routes(只增不改, 开源版核心路由零改动)。
// 红线: 本文件不含任何收款/订阅/webhook 代码(LS G1 挂起, 禁止实现收款链路)。
"use strict";
const { openHostingDb, defaultDbPath, deleteExpiredSessions } = require("./db.cjs");
const { createHostingRoutes } = require("./routes.cjs");

/**
 * 初始化托管层: 打开 DB + 生成路由表 + 启动过期会话清理。
 * 返回 { routes, db } — routes 供 index.cjs Object.assign 进 routes 对象。
 */
function initHosting() {
  const db = openHostingDb(defaultDbPath());
  // 每日清理过期会话(防 sessions 表膨胀); unref 不阻塞进程退出
  const sweeper = setInterval(() => {
    try { deleteExpiredSessions(db); } catch (e) { console.error("[hosting] session sweep error:", e?.message || e); }
  }, 24 * 3600 * 1000);
  sweeper.unref();
  const routes = createHostingRoutes(db);
  console.log("[hosting] 托管层已启用 — 单实例多租户账号系统(内测版)");
  return { routes, db };
}

module.exports = { initHosting, defaultDbPath };
