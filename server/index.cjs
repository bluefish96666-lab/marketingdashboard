/**
 * 市场研究驾驶舱 — 数据代理与静态服务器
 * 聚合: 腾讯行情(A股/港股/美股/汇率) · 腾讯板块榜 · 新浪期货(金银铜油)
 *       新浪个股榜单 · 新浪资金流 · 新浪7x24快讯 · CNBC美债收益率
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { num, changeOf, pctOf, fmtHHMM, toMarketCode6 } = require("./lib/format.cjs");
const { parseCsvParam, chunked, safeRecord } = require("./lib/netutil.cjs");
const { bjToday, readHistory, writeHistory } = require("./lib/persist.cjs");
const { createCache } = require("./lib/cache.cjs");
const createFetchAny = require("./lib/fetch-any.cjs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 运行观测(压测/运维): 仅聚合计数, 无敏感信息; /api/stats 读取
const stats = { reqs: 0, upstream: 0, blocked: 0, started: Date.now() };

// 统一上游数据通道(fetch/curl 双通道 + 状态码校验)与统一内存缓存(命名 TTL + 失败退避 + 负缓存)
const { fetchText, curlText, fetchTextAny, fetchWithFallback, UA } = createFetchAny({ onUpstream: () => stats.upstream++ });
const { cache, set: cacheSet, sweep: sweepCache, backoffOf, cached, quoteBackoff, entry, failEntry, TTLS } = createCache();
const qqRank = require("./lib/qq-rank.cjs")({ fetchText, num });

// 加载 .env(须先于数据源模块 require, 模块内读取 process.env 密钥)
try {
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
      const m = line.trim().match(/^export\s+(.+?)=(.*)$/) || line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    console.log("[env] loaded", envPath);
  }
} catch (e) { console.error("[env] load error:", e.message); }

// 数据源适配器(依赖注入共享工具: 统一 fetch 通道 / 统一缓存)
const srcTencent = require("./sources/tencent.cjs")({
  fetchText, fetchTextAny, curlText, cache, cacheSet, parseCsvParam, chunked, safeRecord, num, changeOf, pctOf,
  entry, failEntry, quoteBackoff, TTLS, qqRank,
});
const { handleQuotes, handleMinute, handleBoards, handleBoardStocks } = srcTencent;

const srcFutures = require("./sources/futures.cjs")({
  fetchText, curlText, fetchWithFallback, num, changeOf, pctOf, fmtHHMM, safeRecord,
  cache, cacheSet, cached, entry, failEntry, quoteBackoff, TTLS,
});
const { handleFutures, handleFutureMinute, handleFutureDaily } = srcFutures;

const srcAi = require("./sources/ai.cjs")({
  cache, cacheSet, cached, entry, failEntry, quoteBackoff, TTLS,
});
const { handleMysterySelect } = srcAi;

const srcEastmoney = require("./sources/eastmoney.cjs")({
  fetchText, fetchWithFallback, cache, cacheSet, num, toMarketCode6,
  entry, failEntry, quoteBackoff, TTLS, qqRank,
});
const { handleRank, handleMoneyFlow, handleStockBoards, handleMoneyFlowEM, handleStockFlows, handleBoardFlow, fetchSinaJson } = srcEastmoney;

const srcSina = require("./sources/sina.cjs")({
  fetchTextAny, fetchSinaJson, num, toMarketCode6,
  cache, cacheSet, cached, entry, failEntry, quoteBackoff, TTLS,
});
const { handleNews, handleStockSearch } = srcSina;

const srcEastmoneyFin = require("./sources/eastmoney-fin.cjs")({
  fetchTextAny, num, toMarketCode6,
  cache, cacheSet, cached, entry, failEntry, quoteBackoff, TTLS,
});
const { handleFinanceMain, handleFinanceBoard, handleFinanceForecast, validPeriod } = srcEastmoneyFin;

const srcTreasuries = require("./sources/treasuries.cjs")({ fetchTextAny, num, fs, path });
const { handleTreasuries, handleTreasuryHistory } = srcTreasuries;

const srcOpenRouter = require("./sources/openrouter.cjs")({ safeRecord, fs, path });
const { handleOpenRouterUsage } = srcOpenRouter;

const srcAiInfra = require("./sources/ai-infra.cjs")({ fetchText, readHistory, writeHistory });
const { handleAiInfra } = srcAiInfra;

const srcSunsirs = require("./sources/sunsirs.cjs")({ fetchText, num, UA, readHistory, writeHistory, bjToday, path, fs });
const { handleSpotTable, handleChemSpot } = srcSunsirs;

const srcAiModels = require("./sources/ai-models.cjs")({ fetchText, num, readHistory, writeHistory, bjToday, path, fs });
const { handleAaModels, handleSpendIndex } = srcAiModels;

// 个股资金流上游 inflight 去重表(handleStockFlows 使用)
const flowInflight = new Map();

// 活跃访客窗口: ip -> 最近请求时间戳; /api/stats 暴露 activeIps5m / visitors24h
const activeIps = new Map(); // ip -> lastSeen(ms), 24h 内访问过的 IP 保留(个人站点量级, 内存有界)
const activeSweeper = setInterval(() => {
  const cutoff = Date.now() - 24 * 3600 * 1000;
  for (const [ip, last] of activeIps) if (last < cutoff) activeIps.delete(ip);
}, 5 * 60 * 1000);
activeSweeper.unref();
function trackActiveIp(ip) { activeIps.set(ip, Date.now()); }

const PORT = process.env.PORT || 3000;
const DIST = path.join(__dirname, "..", "dist");

function send(res, code, obj, extra = {}) {
  const body = typeof obj === "string" ? obj : JSON.stringify(obj);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  };
  // extra 中值为 null 的头表示显式移除; ACAO 不默认下发, 仅同源请求由 corsHeadersFor 反射
  for (const k of Object.keys(headers)) if (headers[k] == null) delete headers[k];
  res.writeHead(code, headers);
  res.end(body);
}

/* ---------------- TTL 缓存 + 并发合并(防上游限流) — cached() 在 lib/cache.cjs 统一实现 ---------------- */

const { handleChainParse } = require("./lib/chain-parse.cjs");

/* ---------------- 主机路由表 ---------------- */
const routes = {
  "/api/quotes": async (q) => handleQuotes(q.get("codes") || ""), // 内部按代码独立缓存(TTL 5s)
  "/api/aa-models": async () => cached("aa-models", 24 * 3600 * 1000, () => handleAaModels()), // AA 全模型定价, 24h 缓存 + 每日快照落盘
  "/api/spend-index": async () => cached("spend-index", 6 * 3600 * 1000, () => handleSpendIndex()), // traktoken 支出指数(60天 + 事件)
  "/api/stats": async () => {
    const now = Date.now();
    const cutoff5m = now - 5 * 60 * 1000;
    const cutoff24h = now - 24 * 3600 * 1000;
    let active5m = 0, visitors24h = 0;
    for (const last of activeIps.values()) {
      if (last >= cutoff5m) active5m++;
      if (last >= cutoff24h) visitors24h++;
    }
    return {
      reqs: stats.reqs, upstream: stats.upstream, blocked: stats.blocked,
      uptimeSec: Math.round((now - stats.started) / 1000),
      activeIps5m: active5m, visitors24h,
    };
  },
  "/api/minute": async (q) =>
    cached(`minute:${q.get("code")}`, 5000, () => handleMinute(q.get("code") || "sh000001")),
  // 批量分钟线: 将 N 次单独请求合并为 1 次, 大幅降低冷启动爆发请求数
  "/api/batch-minute": async (q) => {
    const codes = parseCsvParam(q.get("codes") || "");
    if (codes.length === 0) return {};
    if (codes.length > 30) codes.length = 30; // 上限防滥用
    const map = {};
    // 逐个走缓存(每个 code 各自 5s TTL), 但共享一次 HTTP 往返
    await Promise.all(codes.map(async (c) => {
      try { map[c] = await cached(`minute:${c}`, 5000, () => handleMinute(c)); } catch (e) { map[c] = null; console.error("[batch-minute]", c, e?.message || e); }
    }));
    return map;
  },
  "/api/boards": async (q) =>
    cached(`boards:${q.get("type")}:${q.get("dir")}:${q.get("n")}`, 5000, () =>
      handleBoards(q.get("type") || "01", q.get("dir") || "0", q.get("n") || "30")
    ),
  "/api/board-stocks": async (q) =>
    cached(`bstocks:${q.get("code")}:${q.get("dir")}:${q.get("n")}`, 8000, () =>
      handleBoardStocks(q.get("code") || "", q.get("dir") || "down", q.get("n") || "10")
    ),
  "/api/futures": async (q) =>
    cached(`futures:${q.get("list")}`, 15000, () => handleFutures(q.get("list") || "hf_GC,hf_XAU,hf_SI,hf_CAD,hf_CL,hf_VX,nf_AU0,BTCUSDT")),
  "/api/future-daily": async (q) =>
    cached(`fdaily:${q.get("code")}:${q.get("n") || ""}`, 3600000, () =>
      handleFutureDaily(q.get("code") || "", Math.min(parseInt(q.get("n")) || 400, 5000))
    ), // 日线K线(默认近400根), 1h缓存
  "/api/spot-table": async () => cached("spot:table", 8 * 3600000, () => handleSpotTable()), // 生意社现期表, 8h缓存(每日16:30更新)
  "/api/chem-spot": async (q) =>
    cached(`chem:${q.get("id")}:${q.get("name") || ""}`, 8 * 3600000, () =>
      handleChemSpot(q.get("id") || "", q.get("name") || q.get("id") || "")), // 生意社化工现货, 8h缓存
  "/api/future-minute": async (q) =>
    cached(`fmin:${q.get("code")}`, 60000, () => handleFutureMinute(q.get("code") || "")),
  // 批量期货分钟线
  "/api/batch-fmin": async (q) => {
    const codes = parseCsvParam(q.get("codes") || "");
    if (codes.length === 0) return {};
    if (codes.length > 20) codes.length = 20;
    const map = {};
    await Promise.all(codes.map(async (c) => {
      try { map[c] = await cached(`fmin:${c}`, 60000, () => handleFutureMinute(c)); } catch (e) { map[c] = null; console.error("[batch-fmin]", c, e?.message || e); }
    }));
    return map;
  },
  "/api/rank": async (q) =>
    cached(`rank:${q.get("sort")}:${q.get("asc")}:${q.get("n")}`, 5000, () =>
      handleRank(q.get("sort") || "changepercent", q.get("asc") || "0", q.get("n") || "30")
    ),
  "/api/moneyflow": async (q) =>
    cached(`mf:${q.get("n")}`, 8000, () =>
      // 东财主源, 失败回退新浪
      handleMoneyFlowEM(q.get("n") || "20").then((rows) => {
        if (rows.length) return rows;
        return handleMoneyFlow(q.get("n") || "20");
      }).catch(() => handleMoneyFlow(q.get("n") || "20"))
    ),
  "/api/stock-flow": async (q) =>
    handleStockFlows(q.get("code") || "", flowInflight).then((rows) => rows[0] || Promise.reject(new Error("empty stock-flow"))),
  "/api/stock-flows": async (q) => handleStockFlows(q.get("codes") || "", flowInflight),
  "/api/board-flow": async (q) => cached(`bf:${q.get("n")}`, 120000, () => handleBoardFlow(q.get("n") || "20")),
  "/api/stock-boards": async (q) =>
    cached(`sb:${q.get("code")}`, 24 * 3600 * 1000, () => handleStockBoards(q.get("code") || "")),
  "/api/news": async (q) =>
    cached(`news:${q.get("page")}:${q.get("size")}`, 8000, () =>
      handleNews(q.get("page") || "1", q.get("size") || "40")
    ),
  "/api/treasuries": async () => cached("treasuries", 30000, () => handleTreasuries()),
  "/api/finance-main": async (q) =>
    cached(`fin-main:${q.get("code")}`, 3600000, () => handleFinanceMain(q.get("code") || "")), // 单公司近12期主指标, 1h缓存
  "/api/finance-board": async (q) => {
    const p = validPeriod(q.get("period"));
    return cached(`fin-board:${p}`, 3600000, () => handleFinanceBoard(p)); // 盈利榜+行业聚合+披露日历, 1h缓存
  },
  "/api/finance-forecast": async (q) => {
    const p = validPeriod(q.get("period"));
    return cached(`fin-forecast:${p}`, 3600000, () => handleFinanceForecast(p)); // 业绩预告, 1h缓存
  },
  "/api/treasury-history": async () => cached("treasury-history", 6 * 3600 * 1000, () => handleTreasuryHistory()),
  "/api/health": async () => ({ status: "up", ts: Date.now(), cache: cache.size }),
  "/api/openrouter-usage": async () => cached("or-usage", 3600000, () => handleOpenRouterUsage()), // 1h cache
  "/api/ai-infra": async () => cached("ai-infra", 24 * 3600 * 1000, () => handleAiInfra()), // 财报/定价日更, 24h 缓存
  "/api/mystery-select": async (q) =>
    cached(`ms:${q.get("query")}:${q.get("limit")}:${q.get("page")}`, 60000, () =>
      handleMysterySelect(q.get("query") || "", q.get("limit") || "30", q.get("page") || "1")
    ),
  "/api/stock-search": async (q) =>
    cached(`ssearch:${q.get("q")}`, 5000, () => handleStockSearch(q.get("q") || "")), // 前端击键触发, 短缓存防新浪WAF
  "/api/chain-parse": async (_q, body) => handleChainParse(body || {}),
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
};

// 静态资源安全头; CSP 仅随 HTML 下发(脚本均为构建产物, 内联 style 属性需 unsafe-inline)
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' https:", // 浏览器直连兜底源(qt.gtimg.cn / wscn / binance 等)
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
].join("; ");

const STATIC_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
};

/* ---------------- 同源校验与 CORS(经 CF Tunnel 公网可达, 默认不授权任何跨源浏览器读取) ---------------- */
const PROTECTED_ROUTES = new Set(["/api/mystery-select", "/api/openrouter-usage"]);

// 环回地址互认: 开发期 vite 代理(:3000→:3001)跨端口转发, Origin/Host 端口必然不同, 视为同源
const isLoopbackHost = (h) => /^(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|\[::1\])(:\d+)?$/.test(h);

// 带 Origin/Referer 时其 host 必须与请求 Host 一致(或同为环回); 都不带(curl/同源导航)则放行
function isSameOrigin(req) {
  const host = req.headers.host;
  if (!host) return true;
  for (const h of [req.headers.origin, req.headers.referer]) {
    if (!h) continue;
    try {
      const oh = new URL(h).host;
      if (oh !== host && !(isLoopbackHost(oh) && isLoopbackHost(host))) return false;
    } catch {
      return false;
    }
  }
  return true;
}

// 全端点统一: 仅同源(或环回开发)浏览器请求反射 Origin, 跨源一律不下发 ACAO
function corsHeadersFor(req) {
  const origin = req.headers.origin;
  return { "Access-Control-Allow-Origin": origin && isSameOrigin(req) ? origin : null };
}

/* ---------------- 按客户端 IP 限流(CF Tunnel 后真实 IP 取 CF-Connecting-IP 头) ---------------- */
// 仅当连接来自可信代理(Cloudflare 边缘网段或本机环回)时采信代理头, 否则用 socket 地址,
// 防止绕过 Tunnel 直连时伪造 cf-connecting-ip/x-forwarded-for 刷穿限流
const CF_EDGE_RANGES = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
  "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
  "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
  "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
];
function ipInRanges(ip, ranges) {
  if (!ip || ip.includes(":")) return false; // 仅支持 IPv4 网段匹配
  const n = (s) => s.split(".").reduce((a, b) => (a << 8) + +b, 0) >>> 0;
  const addr = n(ip);
  return ranges.some((r) => {
    const [base, bits] = r.split("/");
    const mask = bits === "0" ? 0 : (~0 << (32 - +bits)) >>> 0;
    return (addr & mask) === (n(base) & mask);
  });
}
function clientIp(req) {
  const peer = req.socket.remoteAddress || "unknown";
  const trusted = peer === "127.0.0.1" || peer === "::1" || peer === "::ffff:127.0.0.1" || ipInRanges(peer, CF_EDGE_RANGES);
  if (trusted) {
    const cf = req.headers["cf-connecting-ip"];
    if (typeof cf === "string" && cf.trim()) return cf.trim();
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff.trim()) return xff.split(",")[0].trim();
  }
  return peer;
}

// 滑动窗口计数器: 记录最近 windowMs 内的请求时间戳, 超 max 返回 false。
// 相比固定窗口(首请求起计), 滑动窗口在连续轮询场景下更公平, 不会因窗口边界触发误限。
function makeLimiter(windowMs, max) {
  const hits = new Map(); // ip -> number[] (请求时间戳)
  const sweeper = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, ts] of hits) {
      const idx = ts.findIndex((t) => t >= cutoff);
      if (idx > 0) hits.set(ip, ts.slice(idx));
      else if (idx === -1) hits.delete(ip);
    }
  }, Math.min(windowMs, 30000));
  sweeper.unref();
  return (ip) => {
    const now = Date.now();
    const cutoff = now - windowMs;
    let ts = hits.get(ip);
    if (!ts) { hits.set(ip, [now]); return true; }
    // 剔除过期时间戳
    const idx = ts.findIndex((t) => t >= cutoff);
    if (idx > 0) ts = ts.slice(idx);
    else if (idx === -1) { hits.set(ip, [now]); return true; }
    ts.push(now);
    hits.set(ip, ts);
    return ts.length <= max;
  };
}

// 公开 /api: 每 IP 每分钟 2400 次(40/s)。单个客户端轮询 ~0.5 req/s, 40/s 覆盖 ~80 个用户共享的
// 办公室 NAT 出口 IP; 上游安全由 TTL 缓存 + 失败退避保证, 限流只兜恶意突发
const apiLimiter = makeLimiter(60 * 1000, 2400);
const protectedLimiter = makeLimiter(60 * 1000, 30); // 私有 key 端点: 每 IP 每分钟 30 次, 防脚本刷配额

// 读取 POST body, 超过 limit 字节即停止累积({ tooBig: true }), 防止无限读入
function readBodyWithLimit(req, limit) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const done = (r) => { if (!settled) { settled = true; resolve(r); } };
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        req.removeAllListeners("data");
        req.resume(); // 排空剩余数据, 避免背压卡死连接
        done({ tooBig: true });
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => done({ buf: Buffer.concat(chunks) }));
    req.on("error", () => done({ buf: Buffer.concat(chunks) }));
    req.on("close", () => done({ buf: Buffer.concat(chunks) })); // 客户端中途断连兜底, 防止悬挂
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, "http://localhost");
    if (routes[u.pathname]) {
      stats.reqs++;
      const ip = clientIp(req);
      trackActiveIp(ip);
      const cors = corsHeadersFor(req);
      // 按 IP 限流(先于缓存命中判断, 防唯一 key 旋转造成的上游请求放大)
      const allowed = (PROTECTED_ROUTES.has(u.pathname) ? protectedLimiter : apiLimiter)(clientIp(req));
      if (!allowed) {
        stats.blocked++;
        send(res, 429, { ok: false, error: "too many requests" }, cors);
        return;
      }
      // 私有 API key 端点: 跨源请求直接拒绝, 防止被刷配额
      if (PROTECTED_ROUTES.has(u.pathname) && !isSameOrigin(req)) {
        send(res, 403, { ok: false, error: "forbidden" }, cors);
        return;
      }
      // 用户输入参数长度上限(缓存 key 由参数拼接, 防止无界增长)
      for (const v of u.searchParams.values()) {
        if (v.length > 2000) {
          send(res, 400, { ok: false, error: "param too long" }, cors);
          return;
        }
      }
      try {
        let body;
        if (req.method === "POST") {
          const r = await readBodyWithLimit(req, 256 * 1024);
          if (r.tooBig) {
            res.on("finish", () => req.destroy()); // 响应送达后再回收连接
            send(res, 413, { ok: false, error: "payload too large" }, cors);
            return;
          }
          try { body = JSON.parse(r.buf.toString()); } catch { send(res, 400, { ok: false, error: "invalid json body" }, cors); return; }
        }
        const data = await routes[u.pathname](u.searchParams, body);
        send(res, 200, { ok: true, data, ts: Date.now() }, cors);
      } catch (e) {
        // 错误回显契约: 内部细节只记日志; err.status 由可预期的业务错误(队列满/问财配额等)携带,
        // 其 message 必须为白名单文案(不含 URL/网络细节); 无 status 一律回显静态 "upstream error"
        console.error("[api]", u.pathname, e?.stack || e?.message || e);
        send(res, e?.status || 502, { ok: false, error: e?.status ? e.message : "upstream error" }, cors);
      }
      return;
    }
    // /api/ 下未命中的路由返回 404 JSON, 不走 SPA fallback
    if (u.pathname.startsWith("/api/")) {
      send(res, 404, { ok: false, error: "not found" });
      return;
    }
    // 静态资源 + SPA fallback
    let p = decodeURIComponent(u.pathname);
    if (p === "/") p = "/index.html";
    const file = path.join(DIST, path.normalize(p));
    if (file !== DIST && !file.startsWith(DIST + path.sep)) {
      send(res, 403, { ok: false });
      return;
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        // 带扩展名的资源未命中: 直接 404, 不回退 index.html(避免 200+HTML 伪装成 JS/CSS)
        if (path.extname(file)) return send(res, 404, { ok: false, error: "not found" });
        fs.readFile(path.join(DIST, "index.html"), (e2, html) => {
          if (e2) return send(res, 404, { ok: false });
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Security-Policy": CSP,
            ...STATIC_HEADERS,
          });
          res.end(html);
        });
        return;
      }
      const headers = {
        "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Cache-Control": file.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
        ...STATIC_HEADERS,
      };
      if (file.endsWith(".html")) headers["Content-Security-Policy"] = CSP;
      res.writeHead(200, headers);
      res.end(buf);
    });
  } catch (e) {
    console.error("[server] error:", e?.message || e);
    send(res, 500, { ok: false, error: "internal error" });
  }
});

server.listen(PORT, () => console.log(`[market-cockpit] listening on :${PORT}`));
