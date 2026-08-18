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
// 邀请码格式预检: 生成器字符集为 32 元(去 0/O/1/I/L 后的大写字母+数字), 12 位;
// 预检放宽到 6-32 位大写字母/数字(服务端统一转大写, 兼容手输小写)
const INVITE_CODE_RE = /^[A-Z0-9]{6,32}$/;

/** 携带 HTTP 状态码的业务错误(index.cjs 错误回显契约: e.status + 白名单文案) */
function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/** 从请求头取 Bearer token */
function bearerToken(req) {
  const h = req?.headers?.authorization || "";
  const m = h.match(/^Bearer\s+([A-Za-z0-9_-]{16,128})$/);
  return m ? m[1] : null;
}

/**
 * 客户端 IP(注册失败限流用): 环回对端(cloudflared 本机隧道)时采信 CF-Connecting-IP,
 * 否则用 socket 地址 — 防止绕过隧道直连时伪造代理头刷穿限流。与 index.cjs clientIp 同思路,
 * 托管层自持一份不耦合核心路由(仅环回信任, 覆盖本机 cloudflared 部署形态)。
 */
function clientIpOf(req) {
  const peer = req?.socket?.remoteAddress || "unknown";
  const loopback = peer === "127.0.0.1" || peer === "::1" || peer === "::ffff:127.0.0.1";
  if (loopback) {
    const cf = req.headers?.["cf-connecting-ip"];
    if (typeof cf === "string" && cf.trim()) return cf.trim();
    const xff = req.headers?.["x-forwarded-for"];
    if (typeof xff === "string" && xff.trim()) return xff.split(",")[0].trim();
  }
  return peer;
}

/**
 * 失败计数器(注册失败限流): 窗口内失败次数 > max → 视为超限(429)。
 * 只统计失败(成功调用 reset 清零), 与全局限流器(防突发)互补, 专防公网暴力破解邀请码/注册轰炸。
 */
function makeFailLimiter(windowMs, max) {
  const fails = new Map(); // ip -> { count, windowStart }
  const sweeper = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, f] of fails) if (f.windowStart < cutoff) fails.delete(ip);
  }, Math.min(windowMs, 30000));
  sweeper.unref();
  return {
    /** 当前是否已超限(只读, 不计数): 窗口内失败已达 max 次 → 下一次尝试直接 429 */
    blocked(ip) {
      const f = fails.get(ip);
      if (!f) return false;
      if (Date.now() - f.windowStart >= windowMs) { fails.delete(ip); return false; }
      return f.count >= max;
    },
    /** 记录一次失败; 返回 false 表示本次计数后已超限 */
    recordFail(ip) {
      const now = Date.now();
      const f = fails.get(ip);
      if (!f || now - f.windowStart >= windowMs) {
        fails.set(ip, { count: 1, windowStart: now });
        return true;
      }
      f.count += 1;
      return f.count <= max;
    },
    reset(ip) { fails.delete(ip); },
  };
}

// 注册失败限流参数: 同 IP 每分钟失败 > 10 次 → 429(10 次/分钟对人工试码绰绰有余, 对脚本暴力破解够紧)。
// 限流器实例挂在 createHostingRoutes 内(每路由表一份, 单测隔离; 生产单实例等价于进程级)。
const REGISTER_FAIL_WINDOW_MS = 60 * 1000;
const REGISTER_FAIL_MAX = 10;

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
  const registerFailLimiter = makeFailLimiter(REGISTER_FAIL_WINDOW_MS, REGISTER_FAIL_MAX);

  /** 注册核心逻辑(校验+建户+原子消耗邀请码), 任何失败抛 httpError。事务内同步执行, 无并发窗口 */
  function doRegister(body) {
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    // 邀请码闸门(0818-q): 必填 → 格式预检 → 查库校验链(存在→未撤销→未使用) → 成功注册后原子标记一次性使用。
    // 校验先于邮箱/密码(注册开关语义: 无有效邀请码 = 注册关闭, 不暴露邮箱状态)。
    const code = String(body?.invite_code || "").trim().toUpperCase();
    if (!code) throw httpError(400, "请填写邀请码");
    if (!INVITE_CODE_RE.test(code)) throw httpError(400, "邀请码无效");
    if (!EMAIL_RE.test(email) || email.length > 200) throw httpError(400, "邮箱格式不正确");
    if (password.length < PASSWORD_MIN || password.length > 128) {
      throw httpError(400, `密码长度需 ${PASSWORD_MIN}-128 位`);
    }
    const tenantId = "t_" + crypto.randomBytes(8).toString("hex");
    let userId;
    db.exec("BEGIN IMMEDIATE"); // 串行化: 邀请码检查+用户插入+标记使用为同一原子单元
    try {
      const invite = db.prepare("SELECT code, revoked, used_at FROM invite_codes WHERE code = ?").get(code);
      if (!invite) throw httpError(400, "邀请码无效");
      if (invite.revoked) throw httpError(403, "邀请码已被撤销");
      if (invite.used_at != null) throw httpError(403, "邀请码已被使用");
      try {
        const ins = db.prepare("INSERT INTO users (tenant_id, email, pass_hash, created_at) VALUES (?, ?, ?, ?)")
          .run(tenantId, email, hashPassword(password), new Date().toISOString());
        userId = Number(ins.lastInsertRowid);
      } catch (err) {
        // UNIQUE 约束冲突 → 邮箱已注册
        if (String(err?.message || "").includes("UNIQUE")) throw httpError(409, "该邮箱已注册，请直接登录");
        throw err;
      }
      // 一次性标记(WHERE 守卫防理论竞态; BEGIN IMMEDIATE 下不可达, 双保险)
      const upd = db.prepare(
        "UPDATE invite_codes SET used_by = ?, used_at = ? WHERE code = ? AND used_at IS NULL AND revoked = 0"
      ).run(userId, Date.now(), code);
      if (upd.changes !== 1) throw httpError(403, "邀请码已被使用");
      db.exec("COMMIT");
    } catch (err) {
      try { db.exec("ROLLBACK"); } catch { /* 回滚失败不影响原错误上报 */ }
      throw err;
    }
    const token = createSession(db, tenantId);
    return { token, tenant: { tenant_id: tenantId, email } };
  }

  return {
    // 前端探测: 托管模式是否启用(未启用时 index.cjs 不挂载本路由, 前端 404 → 视为开源模式)
    "/api/hosting/config": async () => ({
      enabled: true,
      version: 1,
      // 内测期公开行情数据无需登录即可读(共享缓存只读); 个性化数据(watchlist)需登录
      publicData: true,
      accountRequired: true,
    }),

    // 注册: 邀请码 + 邮箱+密码 → 建租户 + 自动登录(返回 token)。不做 OAuth/邮箱验证码(内测从简, w1-3 结论)
    "/api/hosting/register": async (_q, body, req) => {
      const ip = clientIpOf(req);
      // 失败限流先于业务逻辑: 已超限直接 429, 不再放行任何尝试(防暴力破解邀请码/注册轰炸)
      if (registerFailLimiter.blocked(ip)) throw httpError(429, "尝试过于频繁，请稍后再试");
      try {
        const out = doRegister(body);
        registerFailLimiter.reset(ip); // 注册成功清零该 IP 失败计数
        return out;
      } catch (err) {
        registerFailLimiter.recordFail(ip); // 任何注册失败(含无效邀请码)都计数
        throw err;
      }
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
