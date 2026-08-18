// mrd 托管版 · 托管层路由（挂载到 index.cjs 的 routes 对象，不改动核心路由）
// 单实例多租户账号系统: 邮箱+密码注册/登录(SQLite users 表) + Bearer token 会话
// + 按租户隔离的个性化数据(watchlist)。公开行情数据仍走共享缓存(只读, 无隔离需求)。
// 红线: 不实现收款链路(LS webhook/订阅 G1 挂起)；密码只存 scrypt 哈希。
"use strict";
const crypto = require("crypto");
const {
  hashPassword, verifyPassword, createSession, resolveToken,
  deleteSession, getWatchlist, setWatchlist,
} = require("./db.cjs");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;

/** 从请求头取 Bearer token */
function bearerToken(req) {
  const h = req?.headers?.authorization || "";
  const m = h.match(/^Bearer\s+([A-Za-z0-9_-]{16,128})$/);
  return m ? m[1] : null;
}

/** 401 构造器(统一文案, 不泄露细节) */
function unauthorized() {
  const e = new Error("请先登录");
  e.status = 401;
  return e;
}

/**
 * 创建托管层路由表。db 为已打开的 SQLite DatabaseSync。
 * 路由签名与 index.cjs routes 一致: async (q, body, req) => data
 */
function createHostingRoutes(db) {
  return {
    // 前端探测: 托管模式是否启用(未启用时 index.cjs 不挂载本路由, 前端 404 → 视为开源模式)
    "/api/hosting/config": async () => ({
      enabled: true,
      version: 1,
      // 内测期公开行情数据无需登录即可读(共享缓存只读); 个性化数据(watchlist)需登录
      publicData: true,
      accountRequired: true,
    }),

    // 注册: 邮箱+密码 → 建租户 + 自动登录(返回 token)。不做 OAuth/邮箱验证码(内测从简, w1-3 结论)
    "/api/hosting/register": async (_q, body, req) => {
      const email = String(body?.email || "").trim().toLowerCase();
      const password = String(body?.password || "");
      if (!EMAIL_RE.test(email) || email.length > 200) {
        const e = new Error("邮箱格式不正确");
        e.status = 400;
        throw e;
      }
      if (password.length < PASSWORD_MIN || password.length > 128) {
        const e = new Error(`密码长度需 ${PASSWORD_MIN}-128 位`);
        e.status = 400;
        throw e;
      }
      const tenantId = "t_" + crypto.randomBytes(8).toString("hex");
      try {
        db.prepare("INSERT INTO users (tenant_id, email, pass_hash, created_at) VALUES (?, ?, ?, ?)")
          .run(tenantId, email, hashPassword(password), new Date().toISOString());
      } catch (err) {
        // UNIQUE 约束冲突 → 邮箱已注册
        const e = new Error("该邮箱已注册，请直接登录");
        e.status = 409;
        throw e;
      }
      const token = createSession(db, tenantId);
      return { token, tenant: { tenant_id: tenantId, email } };
    },

    // 登录: 邮箱+密码 → 校验 → 新会话 token
    "/api/hosting/login": async (_q, body) => {
      const email = String(body?.email || "").trim().toLowerCase();
      const password = String(body?.password || "");
      const row = db.prepare("SELECT tenant_id, email, pass_hash FROM users WHERE email = ?").get(email);
      if (!row || !verifyPassword(password, row.pass_hash)) {
        const e = new Error("邮箱或密码不正确");
        e.status = 401;
        throw e;
      }
      const token = createSession(db, row.tenant_id);
      return { token, tenant: { tenant_id: row.tenant_id, email: row.email } };
    },

    // 登出: 删除当前会话
    "/api/hosting/logout": async (_q, _body, req) => {
      const token = bearerToken(req);
      deleteSession(db, token);
      return { ok: true };
    },

    // 当前用户信息(token → tenant)
    "/api/hosting/me": async (_q, _body, req) => {
      const token = bearerToken(req);
      const tenantId = resolveToken(db, token);
      if (!tenantId) throw unauthorized();
      const row = db.prepare("SELECT tenant_id, email, created_at FROM users WHERE tenant_id = ?").get(tenantId);
      if (!row) throw unauthorized();
      return { tenant: { tenant_id: row.tenant_id, email: row.email, created_at: row.created_at } };
    },

    // 自选股: 按租户读写(watchlist 为唯一个性化数据, 写入按 tenant_id 隔离)
    // GET = 读取; POST = 覆盖写入(分发逻辑仅 POST 解析 body, GET 时 body 为 undefined)
    "/api/hosting/watchlist": async (_q, body, req) => {
      const token = bearerToken(req);
      const tenantId = resolveToken(db, token);
      if (!tenantId) throw unauthorized();
      if (req.method === "POST") {
        const codes = setWatchlist(db, tenantId, body?.codes);
        return { codes };
      }
      return { codes: getWatchlist(db, tenantId) };
    },
  };
}

module.exports = { createHostingRoutes, bearerToken };
