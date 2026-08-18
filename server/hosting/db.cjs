// mrd 托管版 · 账号库（SQLite，node:sqlite 内置，零第三方依赖）
// 单实例多租户: 每个用户 = 一个租户(tenant_id)；个性化数据按 tenant_id 读写，
// 公开行情数据走共享缓存(只读，无隔离需求) — 见 mrd-hosting-plan.md §1.3。
// 红线: 密码绝不明文(仅存 scrypt 哈希)；不存任何收款/订阅字段(收款 G1 挂起)。
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { DatabaseSync } = require("node:sqlite");

const SCHEMA_VERSION = 2;

/** 打开(必要时创建)账号库并迁移到最新 schema。dbPath 可注入(测试用 :memory: 或临时文件) */
function openHostingDb(dbPath) {
  if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  migrate(db);
  return db;
}

function migrate(db) {
  const row = db.prepare("PRAGMA user_version").get();
  const ver = row ? Number(row.user_version) : 0;
  if (ver < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        pass_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES users(tenant_id),
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS prefs (
        tenant_id TEXT PRIMARY KEY REFERENCES users(tenant_id),
        watchlist TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON sessions(tenant_id);
    `);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }
  if (ver < 2) {
    // 0818-q: 公网内测邀请码闸门 — 一次性邀请码(注册必填)。used_by/used_at 标记使用;
    // revoked=1 撤销(撤销后不可用, 已注册用户不受影响)。created_at/used_at 用 epoch 毫秒 INTEGER。
    db.exec(`
      CREATE TABLE IF NOT EXISTS invite_codes (
        code TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        used_by INTEGER REFERENCES users(id),
        used_at INTEGER,
        revoked INTEGER NOT NULL DEFAULT 0
      );
    `);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }
}

/* ---------------- 默认库路径(CLI 与托管层入口共用, 单一事实源) ---------------- */
/** 默认账号库路径: server/data/hosting.db(随 server/data gitignored, 不提交) */
function defaultDbPath() {
  return process.env.HOSTING_DB || path.join(__dirname, "..", "data", "hosting.db");
}

/* ---------------- 邀请码(0818-q: 公网内测注册闸门) ---------------- */
// 12 位随机码, 字符集剔除全部易混淆字符(0/O/1/I/L): 23 大写字母 + 8 数字 = 31 元字符集
const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const INVITE_LEN = 12;

/** 生成单个 12 位随机邀请码(crypto.randomInt 无模偏差, 每字符 5 bit 熵) */
function generateInviteCode() {
  let s = "";
  for (let i = 0; i < INVITE_LEN; i++) s += INVITE_ALPHABET[crypto.randomInt(INVITE_ALPHABET.length)];
  return s;
}

/** 生成并插入 n 个邀请码(revoked=0), 返回生成的码数组(stdout 打印用)。主键冲突(极小概率)自动重试 */
function createInviteCodes(db, n) {
  const codes = [];
  const stmt = db.prepare("INSERT INTO invite_codes (code, created_at) VALUES (?, ?)");
  const now = Date.now();
  while (codes.length < n) {
    const code = generateInviteCode();
    try {
      stmt.run(code, now);
      codes.push(code);
    } catch (err) {
      const m = String(err?.message || "");
      if (m.includes("UNIQUE") || m.includes("PRIMARY")) continue; // 撞码重试
      throw err;
    }
  }
  return codes;
}

/** 撤销邀请码(revoked=1): 撤销后不可再用于注册; 已注册用户不受影响。返回是否确有该码 */
function revokeInviteCode(db, code) {
  if (typeof code !== "string" || !code) return false;
  const r = db.prepare("UPDATE invite_codes SET revoked = 1 WHERE code = ? AND revoked = 0").run(code);
  return r.changes === 1;
}

/* ---------------- 密码哈希(scrypt)与校验 ---------------- */
const SCRYPT_N = 16384, SCRYPT_R = 8, SCRYPT_P = 1, SCRYPT_KEYLEN = 64;

/** scrypt 哈希: 返回 "scrypt$N$r$p$saltHex$hashHex" */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** 常量时间校验密码哈希; 格式不符直接 false */
function verifyPassword(password, stored) {
  try {
    const [algo, n, r, p, saltHex, hashHex] = String(stored || "").split("$");
    if (algo !== "scrypt" || !saltHex || !hashHex) return false;
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const actual = crypto.scryptSync(password, salt, expected.length, {
      N: Number(n) || SCRYPT_N, r: Number(r) || SCRYPT_R, p: Number(p) || SCRYPT_P,
    });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/* ---------------- 会话 token ---------------- */
const TOKEN_BYTES = 32;
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 30 天

/** 生成新会话 token(明文返回给客户端, 库中只存 sha256 哈希) */
function createSession(db, tenantId) {
  const token = crypto.randomBytes(TOKEN_BYTES).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const now = Date.now();
  db.prepare("INSERT INTO sessions (token_hash, tenant_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(tokenHash, tenantId, new Date(now).toISOString(), new Date(now + SESSION_TTL_MS).toISOString());
  return token;
}

/** 校验 Bearer token → tenant_id(过期/不存在返回 null); 顺带删除过期会话 */
function resolveToken(db, token) {
  if (!token || typeof token !== "string") return null;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const row = db.prepare("SELECT tenant_id, expires_at FROM sessions WHERE token_hash = ?").get(tokenHash);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
    return null;
  }
  return row.tenant_id;
}

function deleteSession(db, token) {
  if (!token) return;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

function deleteExpiredSessions(db) {
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date().toISOString());
}

/* ---------------- 租户个性化数据(watchlist 等) ---------------- */
function getWatchlist(db, tenantId) {
  const row = db.prepare("SELECT watchlist FROM prefs WHERE tenant_id = ?").get(tenantId);
  if (!row) return [];
  try {
    const arr = JSON.parse(row.watchlist);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** 写入 watchlist(按租户覆盖), 返回写入后的列表 */
function setWatchlist(db, tenantId, codes) {
  const clean = (Array.isArray(codes) ? codes : [])
    .filter((c) => typeof c === "string" && /^(sh|sz|bj|nq)\d{6}$/.test(c))
    .slice(0, 200);
  db.prepare(`
    INSERT INTO prefs (tenant_id, watchlist, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(tenant_id) DO UPDATE SET watchlist = excluded.watchlist, updated_at = excluded.updated_at
  `).run(tenantId, JSON.stringify(clean), new Date().toISOString());
  return clean;
}

module.exports = {
  openHostingDb, defaultDbPath, hashPassword, verifyPassword, createSession, resolveToken,
  deleteSession, deleteExpiredSessions, getWatchlist, setWatchlist,
  createInviteCodes, revokeInviteCode, generateInviteCode, SCHEMA_VERSION,
};
