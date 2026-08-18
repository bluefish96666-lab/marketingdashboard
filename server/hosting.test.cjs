// mrd 托管版 · 账号系统单测（node --test）
// 覆盖: 注册/登录/密码哈希(绝不明文)/会话 token/租户隔离(watchlist A 不泄漏 B)/401/409
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  openHostingDb, hashPassword, verifyPassword, createSession, resolveToken,
  deleteSession, getWatchlist, setWatchlist,
} = require("./hosting/db.cjs");
const { createHostingRoutes } = require("./hosting/routes.cjs");

/** 内存库: 每次测试独立, 无文件残留 */
function freshDb() {
  return openHostingDb(":memory:");
}

/** 调用托管路由 handler 的便捷包装(返回 {status, data} 或抛出带 status 的错误) */
async function call(handler, { method = "GET", body, token } = {}) {
  const req = {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
  const searchParams = new URLSearchParams();
  try {
    const data = await handler(searchParams, method === "POST" ? body : undefined, req);
    return { status: 200, data };
  } catch (e) {
    return { status: e.status || 502, error: e.message };
  }
}

test("db: 打开内存库 + schema 版本", () => {
  const db = freshDb();
  const ver = db.prepare("PRAGMA user_version").get();
  assert.strictEqual(Number(ver.user_version), 1);
  db.close();
});

test("db: 密码哈希 — scrypt, 绝不明文, 同密码两次哈希不同", () => {
  const h1 = hashPassword("secret123");
  const h2 = hashPassword("secret123");
  assert.ok(h1.startsWith("scrypt$"));
  assert.ok(!h1.includes("secret123"), "哈希中不得包含明文密码");
  assert.notStrictEqual(h1, h2, "盐随机 → 两次哈希不同");
  assert.ok(verifyPassword("secret123", h1));
  assert.ok(!verifyPassword("wrongpass", h1));
  assert.ok(!verifyPassword("secret123", "garbage"), "格式不符返回 false");
});

test("db: 会话 token — 库中只存 sha256, 可解析/过期失效/登出", () => {
  const db = freshDb();
  db.prepare("INSERT INTO users (tenant_id, email, pass_hash, created_at) VALUES (?, ?, ?, ?)")
    .run("t_test1", "a@b.com", hashPassword("pw12345678"), new Date().toISOString());
  const token = createSession(db, "t_test1");
  assert.strictEqual(token.length, 64, "32 字节 hex");
  // 库中存的是哈希, 不是明文 token
  const rows = db.prepare("SELECT token_hash FROM sessions").all();
  assert.strictEqual(rows.length, 1);
  assert.notStrictEqual(rows[0].token_hash, token);
  // 解析成功
  assert.strictEqual(resolveToken(db, token), "t_test1");
  assert.strictEqual(resolveToken(db, "bad-token"), null);
  // 登出后失效
  deleteSession(db, token);
  assert.strictEqual(resolveToken(db, token), null);
  db.close();
});

test("db: watchlist 按租户隔离 — A 写入 B 读不到", () => {
  const db = freshDb();
  db.prepare("INSERT INTO users (tenant_id, email, pass_hash, created_at) VALUES (?, ?, ?, ?)")
    .run("t_A", "a@a.com", hashPassword("pw12345678"), new Date().toISOString());
  db.prepare("INSERT INTO users (tenant_id, email, pass_hash, created_at) VALUES (?, ?, ?, ?)")
    .run("t_B", "b@b.com", hashPassword("pw12345678"), new Date().toISOString());
  // A 写入自选
  const saved = setWatchlist(db, "t_A", ["sh688126", "sz002463", "坏代码x"]);
  assert.deepStrictEqual(saved, ["sh688126", "sz002463"], "非法代码被过滤");
  // A 读到自己的
  assert.deepStrictEqual(getWatchlist(db, "t_A"), ["sh688126", "sz002463"]);
  // B 读不到 A 的数据(空列表, 不泄漏)
  assert.deepStrictEqual(getWatchlist(db, "t_B"), []);
  // B 写入自己的, A 不受影响
  setWatchlist(db, "t_B", ["sh600519"]);
  assert.deepStrictEqual(getWatchlist(db, "t_B"), ["sh600519"]);
  assert.deepStrictEqual(getWatchlist(db, "t_A"), ["sh688126", "sz002463"]);
  db.close();
});

test("api: 注册 → 自动登录 → me 回显邮箱", async () => {
  const db = freshDb();
  const routes = createHostingRoutes(db);
  const reg = await call(routes["/api/hosting/register"], {
    method: "POST", body: { email: "Tester@Example.com", password: "pass123456" },
  });
  assert.strictEqual(reg.status, 200);
  assert.ok(reg.data.token, "注册即返回 token");
  assert.strictEqual(reg.data.tenant.email, "tester@example.com", "邮箱归一化小写");
  const me = await call(routes["/api/hosting/me"], { token: reg.data.token });
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.data.tenant.email, "tester@example.com");
  assert.ok(me.data.tenant.tenant_id.startsWith("t_"));
  db.close();
});

test("api: 重复邮箱注册 → 409; 非法邮箱/短密码 → 400", async () => {
  const db = freshDb();
  const routes = createHostingRoutes(db);
  await call(routes["/api/hosting/register"], { method: "POST", body: { email: "dup@x.com", password: "pass123456" } });
  const dup = await call(routes["/api/hosting/register"], { method: "POST", body: { email: "dup@x.com", password: "other12345" } });
  assert.strictEqual(dup.status, 409);
  const badEmail = await call(routes["/api/hosting/register"], { method: "POST", body: { email: "not-an-email", password: "pass123456" } });
  assert.strictEqual(badEmail.status, 400);
  const shortPw = await call(routes["/api/hosting/register"], { method: "POST", body: { email: "ok@x.com", password: "short" } });
  assert.strictEqual(shortPw.status, 400);
  db.close();
});

test("api: 登录正确密码 → token; 错误密码 → 401; 不存在邮箱 → 401", async () => {
  const db = freshDb();
  const routes = createHostingRoutes(db);
  await call(routes["/api/hosting/register"], { method: "POST", body: { email: "login@x.com", password: "pass123456" } });
  const ok = await call(routes["/api/hosting/login"], { method: "POST", body: { email: "login@x.com", password: "pass123456" } });
  assert.strictEqual(ok.status, 200);
  assert.ok(ok.data.token);
  const bad = await call(routes["/api/hosting/login"], { method: "POST", body: { email: "login@x.com", password: "wrongpass" } });
  assert.strictEqual(bad.status, 401);
  const ghost = await call(routes["/api/hosting/login"], { method: "POST", body: { email: "ghost@x.com", password: "pass123456" } });
  assert.strictEqual(ghost.status, 401);
  db.close();
});

test("api: 未登录访问 me/watchlist → 401; 假 token → 401", async () => {
  const db = freshDb();
  const routes = createHostingRoutes(db);
  const me = await call(routes["/api/hosting/me"], {});
  assert.strictEqual(me.status, 401);
  const wl = await call(routes["/api/hosting/watchlist"], {});
  assert.strictEqual(wl.status, 401);
  const fake = await call(routes["/api/hosting/me"], { token: "f".repeat(64) });
  assert.strictEqual(fake.status, 401);
  db.close();
});

test("api: 全链路租户隔离 — A 注册写自选, B 注册读不到 A 的自选", async () => {
  const db = freshDb();
  const routes = createHostingRoutes(db);
  const a = await call(routes["/api/hosting/register"], { method: "POST", body: { email: "a@iso.com", password: "pass123456" } });
  const b = await call(routes["/api/hosting/register"], { method: "POST", body: { email: "b@iso.com", password: "pass123456" } });
  assert.strictEqual(a.status, 200);
  assert.strictEqual(b.status, 200);
  // A 写入自选
  const putA = await call(routes["/api/hosting/watchlist"], { method: "POST", token: a.data.token, body: { codes: ["sh688126", "sz002463"] } });
  assert.strictEqual(putA.status, 200);
  assert.deepStrictEqual(putA.data.codes, ["sh688126", "sz002463"]);
  // A 读到自己的
  const getA = await call(routes["/api/hosting/watchlist"], { token: a.data.token });
  assert.deepStrictEqual(getA.data.codes, ["sh688126", "sz002463"]);
  // B 读不到 A 的自选(空)
  const getB = await call(routes["/api/hosting/watchlist"], { token: b.data.token });
  assert.deepStrictEqual(getB.data.codes, []);
  // 登出后 token 失效
  await call(routes["/api/hosting/logout"], { token: a.data.token });
  const afterLogout = await call(routes["/api/hosting/me"], { token: a.data.token });
  assert.strictEqual(afterLogout.status, 401);
  db.close();
});

test("api: config 返回托管模式标志", async () => {
  const db = freshDb();
  const routes = createHostingRoutes(db);
  const cfg = await call(routes["/api/hosting/config"], {});
  assert.strictEqual(cfg.status, 200);
  assert.strictEqual(cfg.data.enabled, true);
  db.close();
});

// 数据库文件落盘测试(模拟真实部署路径): 打开→写入→重开→数据仍在
test("db: 文件库持久化 — 重开后数据仍在", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mrd-hosting-test-"));
  const dbPath = path.join(dir, "hosting.db");
  const db1 = openHostingDb(dbPath);
  db1.prepare("INSERT INTO users (tenant_id, email, pass_hash, created_at) VALUES (?, ?, ?, ?)")
    .run("t_persist", "p@x.com", hashPassword("pw12345678"), new Date().toISOString());
  setWatchlist(db1, "t_persist", ["sh600000"]);
  db1.close();
  const db2 = openHostingDb(dbPath);
  assert.strictEqual(getWatchlist(db2, "t_persist")[0], "sh600000");
  const row = db2.prepare("SELECT email FROM users WHERE tenant_id = ?").get("t_persist");
  assert.strictEqual(row.email, "p@x.com");
  db2.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
