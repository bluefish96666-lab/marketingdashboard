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
const { handleRank, handleMoneyFlow, handleStockBoards, handleMoneyFlowEM, handleBoardMoneyFlow, handleStockFlows, handleBoardFlow, fetchSinaJson } = srcEastmoney;

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

const srcAiInfra = require("./sources/ai-infra.cjs")({ fetchText, fetchWithFallback, readHistory, writeHistory, bjToday, num, fs, path });
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

/* ---------------- GitHub stars 汇总配置（公司产品仓库白名单）----------------
   加产品仓库：只改 GITHUB_STARS_WHITELIST 数组，无需改代码 */
const GITHUB_STARS_OWNER = "theBigGavin";
const GITHUB_STARS_WHITELIST = ["marketingdashboard", "mylauncher"];

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
  "/api/leads": async (_q, body) => {
    // Pro landing 预注册: 收集付费意向线索, 落盘到 data/leads.json
    const email = String(body?.email || "").trim().slice(0, 200);
    const need = String(body?.need || "").trim().slice(0, 500);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const e = new Error("invalid email"); e.status = 400; throw e;
    }
    const rec = { email, need, plan: String(body?.plan || "").slice(0, 50), ts: new Date().toISOString() };
    const file = path.join(__dirname, "data", "leads.json");
    let arr = [];
    try { arr = JSON.parse(fs.readFileSync(file, "utf-8")); } catch {}
    arr.push(rec);
    fs.writeFileSync(file, JSON.stringify(arr, null, 2));
    return { received: true, count: arr.length };
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
  // 板块成分股主力净流入排行(东财 clist, fs=b:板块代码, f62 降序) — 板块资金流向→主力排行联动
  "/api/board-moneyflow": async (q) =>
    cached(`bmf:${q.get("code")}:${q.get("n")}`, 8000, () =>
      handleBoardMoneyFlow(q.get("code") || "", q.get("n") || "15")
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
  "/api/repo-stats": async () =>
    cached("repo-stats", 3600000, async () => {
      // GitHub repo 元数据(star/forks), 1h 缓存防限流; 失败返回 0 不阻断页面
      try {
        const txt = await fetchText("https://api.github.com/repos/theBigGavin/marketingdashboard", {
          headers: { Accept: "application/vnd.github+json", "User-Agent": UA },
        });
        const d = JSON.parse(txt);
        return { stars: d.stargazers_count ?? 0, forks: d.forks_count ?? 0, ts: Date.now() };
      } catch (e) {
        return { stars: 0, forks: 0, ts: Date.now() };
      }
    }),
  "/api/github/stars": async () =>
    cached("github-stars", 3600000, async () => {
      // 公司产品仓库 star 汇总: users/{owner}/repos 一次拉全, 过滤 fork + 白名单后求和。
      // 1h 缓存防 GitHub 匿名限流(60/h/IP), 限流由服务端单点吸收; 失败时 cached() 降级返回上次成功值
      const txt = await fetchText(
        `https://api.github.com/users/${GITHUB_STARS_OWNER}/repos?per_page=100&type=owner`,
        { headers: { Accept: "application/vnd.github+json", "User-Agent": UA } }
      );
      const repos = JSON.parse(txt);
      const picked = (Array.isArray(repos) ? repos : [])
        .filter((r) => !r.fork && GITHUB_STARS_WHITELIST.includes(r.name))
        .map((r) => ({ name: r.name, stars: r.stargazers_count ?? 0 }));
      return { total: picked.reduce((s, r) => s + r.stars, 0), repos: picked, ts: Date.now() };
    }),
  "/api/openrouter-usage": async () => cached("or-usage", 3600000, () => handleOpenRouterUsage()), // 1h cache
  "/api/ai-infra": async () => cached("ai-infra", 24 * 3600 * 1000, () => handleAiInfra()), // 财报/定价日更, 24h 缓存
  "/api/mystery-select": async (q) =>
    cached(`ms:${q.get("query")}:${q.get("limit")}:${q.get("page")}`, 60000, () =>
      handleMysterySelect(q.get("query") || "", q.get("limit") || "30", q.get("page") || "1")
    ),
  "/api/stock-search": async (q) =>
    cached(`ssearch:${q.get("q")}`, 5000, () => handleStockSearch(q.get("q") || "")), // 前端击键触发, 短缓存防新浪WAF
  "/api/chain-parse": async (_q, body) => handleChainParse(body || {}),
  // ---- OPC 透明办公室 demo 体验（12a）----
  "/api/opc/demo": async (_q, body, req) => {
    // a) 白名单校验: 只认 4 个预设 id, 其他字段一律忽略（防 prompt 注入/防外人驱动 agent）
    const taskId = String(body?.task_id || "").trim();
    if (!DEMO_TASKS[taskId]) { const e = new Error("unknown demo task"); e.status = 400; throw e; }
    const ip = clientIp(req);
    // b) 限流: 同 IP 1 次/60s（先于去重, 快速连点直接 429; 防刷/防烧钱）
    if (!demoLimiter(ip)) { const e = new Error("demo rate limited"); e.status = 429; throw e; }
    const s = demoReadStatus();
    // c) 去重: 同 IP 同任务有缓存(completed)/在飞 → 直接返回现有状态; failed 允许重试
    //    注意: tasks 的 value 不含 demo_id, 必须从 key 取(旧版用 existing.demo_id 恒为 undefined,
    //    JSON 序列化丢弃 → 前端拿不到 demo_id → 误报「体验服务暂不可用」, 12c 实测发现并修复)
    const existing = Object.entries(s.tasks).find(([, t]) => t.ip === ip && t.task_id === taskId);
    if (existing && existing[1].status !== "failed") {
      return { demo_id: existing[0], status: existing[1].status, task_id: existing[1].task_id, cached: true };
    }
    // d) 全局并发上限: 在飞(queued/dispatched/running) ≤ DEMO_MAX_INFLIGHT
    const inflight = Object.values(s.tasks)
      .filter((t) => ["queued", "dispatched", "running"].includes(t.status)).length;
    if (inflight >= DEMO_MAX_INFLIGHT) { const e = new Error("demo busy"); e.status = 429; throw e; }
    // e) 写请求文件(派活 cron 扫描) + 更新 status.json → 返回 demo_id
    const demoId = "d" + Date.now().toString(36) + "_" + crypto.randomBytes(4).toString("hex");
    const now = new Date().toISOString();
    fs.mkdirSync(DEMO_REQ_DIR, { recursive: true });
    fs.writeFileSync(path.join(DEMO_REQ_DIR, `${demoId}.json`),
      JSON.stringify({ demo_id: demoId, task_id: taskId, ip, ts: now }, null, 2));
    s.tasks[demoId] = {
      task_id: taskId, ip, status: "queued",
      created_at: now, started_at: null, finished_at: null, kanban_task_id: null,
    };
    demoWriteStatus(s);
    return { demo_id: demoId, status: "queued", task_id: taskId };
  },
  "/api/opc/demo/status": async (q) => {
    const id = String(q.get("demo_id") || "").trim();
    if (!id) { const e = new Error("demo_id required"); e.status = 400; throw e; }
    const v = demoTaskView(demoReadStatus(), id);
    if (!v) { const e = new Error("demo not found"); e.status = 404; throw e; }
    return v;
  },
  "/api/opc/demo/history": async () => {
    const s = demoReadStatus();
    // history 由状态迁移写入; 空则从 tasks 派生终态条目兜底
    let items = (s.history || []).slice(0, DEMO_HISTORY_MAX);
    if (!items.length) {
      items = Object.entries(s.tasks)
        .filter(([, t]) => ["completed", "failed"].includes(t.status))
        .map(([id, t]) => ({
          demo_id: id, task_id: t.task_id, status: t.status,
          created_at: t.created_at, finished_at: t.finished_at || null,
        }))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, DEMO_HISTORY_MAX);
    }
    return { items, count: items.length };
  },
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

// 公司落地页专用 CSP: 独立静态页, 允许内联脚本(主题切换)与外部图(shields.io star badge)
const COMPANY_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
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

// OPC 透明办公室/demo API 跨源白名单(12c): 仅 www.hermes.cc.cd(CF Pages 静态站, 无后端)允许跨源
// 读写 demo 链路; 其余跨源 origin 一律不下发 ACAO(维持"默认不授权任何跨源浏览器读取"基线)
const OPC_CORS_ORIGINS = new Set(["https://www.hermes.cc.cd"]);

// /api/opc/* 专用: 同源(或环回开发)反射 Origin; 跨源仅白名单放行; 其余不下发
function opcCorsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin) return { "Access-Control-Allow-Origin": null };
  if (isSameOrigin(req) || OPC_CORS_ORIGINS.has(origin)) {
    return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
  }
  return { "Access-Control-Allow-Origin": null };
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

/* ---------------- SSE 公共设施（12a demo 流 + 15a 全局状态流共用） ----------------
 * Gavin 明确要求: 避免两套 SSE 端点/两套订阅逻辑。所有 SSE 端点统一走以下三件套:
 *   setSSEHeaders(res, extra) — 统一响应头(禁缓存 + 防 Nginx/Cloudflare 缓冲)
 *   sendEvent(res, event, data) — 写 event:/data: 帧(帧格式逐字节一致; 两流统一 event: status)
 *   sseHeartbeat(res, ms)      — 保活注释帧定时器(: ping, 浏览器忽略), 返回 timer 供断连清理
 */
function setSSEHeaders(res, extra = {}) {
  const headers = {
    "Content-Type": "text/event-stream; charset=utf-8",
    // no-cache + no-transform: 禁止任何缓存层缓存, 并禁止代理改写(压缩/转码会破坏流)
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // 防 Nginx/Cloudflare 边缘缓冲
    ...extra,
  };
  res.writeHead(200, headers);
}
function sendEvent(res, event, data) {
  // SSE 帧: `event: <name>\ndata: <json>\n\n` —— demo 流与全局流共用, 契约逐字节一致
  try { res.write(`event: ${event}\ndata: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`); } catch {}
}
function sseHeartbeat(res, ms) {
  // 保活: 注释帧防 Cloudflare/反向代理空闲超时断连(CF ~100s), 25~30s 一帧
  return setInterval(() => { try { res.write(": ping\n\n"); } catch {} }, ms);
}

/* ---------------- OPC 全局状态流（15a: 办公室实时状态推送, 持续不关闭） ----------------
 * GET /api/opc/stream — 语义与 demo 流(任务生命周期, 终态后关闭)不同: 办公室状态没有终态,
 * 连接建立推当前全量快照 → 生产 status.json 变更秒级推送 → 心跳保活, 客户端主动断才结束。
 * 事件事实源: dist/company/opc/status.json —— 生产静态目录(mrd 静态服务实际读的就是这份;
 * opc_collect.py 双写 public/ 种子 + dist/ 实时, public/ 仅 npm run build 时被拷贝, 运行时不读)。
 */
const OPC_STATUS_FILE = path.join(DIST, "company", "opc", "status.json");
const OPC_STREAM_MAX_CLIENTS = 50;            // 并发上限: 超限新连接直接 503(防滥用), 可调
const OPC_STREAM_DEBOUNCE_MS = 200;           // fs.watch 防抖: 写是整文件覆盖(open 'w' 截断+写), 立即读可能读到半截
const OPC_STREAM_FALLBACK_POLL_MS = 30 * 1000; // 兜底轮询周期(非主路径, 见 opcStreamStartWatcher)
const OPC_STREAM_HEARTBEAT_MS = 27 * 1000;    // 保活心跳(25~30s 区间取 27s, 防 CF ~100s 空闲超时)

const opcStreamClients = new Set();  // 全局流客户端集合: {res, hb} — hb 心跳定时器随断连清理
let opcStreamWatcher = null;         // fs.watch 句柄(无客户端时关闭, 首连懒启动)
let opcStreamFallbackTimer = null;   // 兜底轮询定时器(同上)
let opcStreamDebounceTimer = null;   // fs.watch 事件防抖定时器
let opcStreamLastMtime = 0;          // 兜底轮询 mtime 对比基准

// 读当前 status.json 全量快照; 失败(半截/不存在)返回 null, 调用方跳过, 绝不 crash
function opcStreamReadSnapshot() {
  try { return JSON.parse(fs.readFileSync(OPC_STATUS_FILE, "utf-8")); } catch { return null; }
}
// 广播当前全量快照给所有全局流客户端
function opcStreamBroadcast() {
  const snap = opcStreamReadSnapshot();
  if (snap == null) return; // 写窗口半截/暂缺: 跳过, 等下一次 change
  for (const c of opcStreamClients) sendEvent(c.res, "status", snap);
}
// 懒启动 watcher(首个客户端连接时): fs.watch 主路径 + 30s mtime 轮询兜底。
// 兜底说明: fs.watch 在部分平台/文件系统(网络盘/容器/编辑器原子替换)不可靠可能丢事件,
// 轮询每 30s 对比 mtimeMs, 变了才推——这是保险, 非主路径。
function opcStreamStartWatcher() {
  if (opcStreamWatcher || opcStreamFallbackTimer) return;
  try { opcStreamLastMtime = fs.statSync(OPC_STATUS_FILE).mtimeMs; } catch { opcStreamLastMtime = 0; }
  try {
    opcStreamWatcher = fs.watch(OPC_STATUS_FILE, { persistent: false }, () => {
      if (opcStreamDebounceTimer) clearTimeout(opcStreamDebounceTimer);
      opcStreamDebounceTimer = setTimeout(() => { opcStreamDebounceTimer = null; opcStreamBroadcast(); }, OPC_STREAM_DEBOUNCE_MS);
    });
  } catch (e) {
    console.error("[opc-stream] fs.watch unavailable, falling back to 30s poll:", e.message);
    opcStreamWatcher = null;
  }
  opcStreamFallbackTimer = setInterval(() => {
    let mtime = 0;
    try { mtime = fs.statSync(OPC_STATUS_FILE).mtimeMs; } catch { return; }
    if (mtime !== opcStreamLastMtime) { opcStreamLastMtime = mtime; opcStreamBroadcast(); }
  }, OPC_STREAM_FALLBACK_POLL_MS);
  opcStreamFallbackTimer.unref();
}
function opcStreamStopWatcher() {
  if (opcStreamWatcher) { try { opcStreamWatcher.close(); } catch {} opcStreamWatcher = null; }
  if (opcStreamFallbackTimer) { clearInterval(opcStreamFallbackTimer); opcStreamFallbackTimer = null; }
  if (opcStreamDebounceTimer) { clearTimeout(opcStreamDebounceTimer); opcStreamDebounceTimer = null; }
}

/* ---------------- OPC 透明办公室 demo 体验（12a: 后端引擎） ----------------
 * 访客在 /company/opc/ 点预设按钮 → 服务端白名单校验 → 写请求文件 → 庄子派活 cron
 * (opc_demo_dispatch.py) 在 demo board 建卡 → 潘明执行 → 报告回传 results/<demo_id>.md。
 * 安全设计（Gavin 拍板，硬约束）:
 *   1. 只允许 4 个预设按钮, 服务端白名单校验, 访客文本一律忽略(防 prompt 注入/防外人驱动 agent 干任意事)
 *   2. 防刷/限流: 同 IP 频控 + 全局并发上限(在飞 ≤2) + 同 IP 同任务去重(有缓存/在飞直接返回现有状态)
 *   3. 任务隔离: demo 用独立 board(boards/demo/kanban.db) + priority=0, 排在正式任务后
 *   4. 报告缓存 + 回看(history)
 *   5. 数据隔离: demo 任务只查外部公开信息, 禁止读内部文件/凭据(约束写进任务 body)
 *   6. 进展实时性: SSE 端点 /api/opc/demo/{id}/stream 推送状态变化(唯一秒级实时性场景, 不走轮询;
 *      普通看板前端轮询 10s 即可——status.json 分钟级变化, 10s 已追平)
 */
const DEMO_TASKS = {
  v2ex_hot:         { name: "V2EX 热帖",   prompt: "帮我收集一下 v2ex 十个热帖（标题+链接+热度）" },
  gz_weather:       { name: "广州天气",     prompt: "帮我查一下广州未来 15 天的天气" },
  gz_trip:          { name: "广州周边旅行", prompt: "给我一个广州周边旅行的计划（2-3 天行程）" },
  niulai_boxoffice: { name: "牛来票房",     prompt: "帮我看看《牛来》这个电影的实时票房" },
};
const DEMO_DIR = path.join(__dirname, "data", "demo");
const DEMO_REQ_DIR = path.join(DEMO_DIR, "requests");
const DEMO_RES_DIR = path.join(DEMO_DIR, "results");
const DEMO_STATUS_FILE = path.join(DEMO_DIR, "status.json");
const DEMO_RATE_WINDOW_MS = 60 * 1000;   // 同 IP 频控窗口: 1 次/60s（防烧钱/防刷，可调）
const DEMO_RATE_MAX = 1;                 // 同 IP 频控上限
const DEMO_MAX_INFLIGHT = 2;             // 全局并发上限: 在飞(queued/dispatched/running) ≤2
const DEMO_HISTORY_MAX = 20;             // 回看入口最多 20 条
const DEMO_SSE_POLL_MS = 2000;           // SSE 内部状态轮询间隔（状态分钟级变化，2s 追平足够）
const DEMO_SSE_MAX_MS = 15 * 60 * 1000;  // SSE 连接硬上限 15 分钟，防资源泄漏
const demoLimiter = makeLimiter(DEMO_RATE_WINDOW_MS, DEMO_RATE_MAX);

// 启动时把预设表同步成 presets.json（供 opc_demo_dispatch.py 读取，单一事实源；服务端仍是硬编码白名单）
try {
  fs.mkdirSync(DEMO_DIR, { recursive: true });
  fs.writeFileSync(path.join(DEMO_DIR, "presets.json"), JSON.stringify(DEMO_TASKS, null, 2));
} catch (e) { console.error("[demo] presets.json sync error:", e.message); }

function demoReadStatus() {
  try { return JSON.parse(fs.readFileSync(DEMO_STATUS_FILE, "utf-8")); } catch { return { tasks: {}, history: [] }; }
}
function demoWriteStatus(s) {
  fs.mkdirSync(DEMO_DIR, { recursive: true });
  fs.writeFileSync(DEMO_STATUS_FILE, JSON.stringify(s, null, 2));
}
// 对外视图: 不含 ip（隐私），completed 时附带报告 markdown（读结果文件）
function demoTaskView(s, id) {
  const t = s.tasks[id];
  if (!t) return null;
  const v = {
    demo_id: id, task_id: t.task_id, status: t.status,
    kanban_task_id: t.kanban_task_id || null,
    created_at: t.created_at, started_at: t.started_at || null, finished_at: t.finished_at || null,
  };
  if (t.status === "completed") {
    v.report_md = "";
    try { v.report_md = fs.readFileSync(path.join(DEMO_RES_DIR, `${id}.md`), "utf-8"); } catch {}
  }
  return v;
}

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
    // ---- OPC 全局状态流 SSE: GET /api/opc/stream（15a, 持续推送不关闭）----
    if (u.pathname === "/api/opc/stream" && req.method === "GET") {
      stats.reqs++;
      const ip = clientIp(req);
      trackActiveIp(ip);
      const cors = opcCorsHeaders(req);
      if (!apiLimiter(ip)) { stats.blocked++; send(res, 429, { ok: false, error: "too many requests" }, cors); return; }
      // 并发上限: 超出直接 503, 客户端应退避重连(EventSource 原生支持断线自动重连)
      if (opcStreamClients.size >= OPC_STREAM_MAX_CLIENTS) {
        send(res, 503, { ok: false, error: "too many concurrent stream clients" }, cors);
        return;
      }
      const headers = { ...cors };
      if (headers["Access-Control-Allow-Origin"] == null) delete headers["Access-Control-Allow-Origin"];
      setSSEHeaders(res, headers);
      const client = { res, hb: sseHeartbeat(res, OPC_STREAM_HEARTBEAT_MS) };
      res.on("error", () => {}); // 断连竞态下迟到 write 会 emit error, 吞掉防进程 crash
      opcStreamClients.add(client);
      // 1) 连接建立: 立即推当前 status.json 全量快照(前端首帧无需再 fetch)
      const snap = opcStreamReadSnapshot();
      if (snap) sendEvent(res, "status", snap);
      opcStreamStartWatcher();
      // 6) 断连清理: 移出集合 + 清心跳定时器(防内存泄漏); 无客户端时停 watcher
      req.on("close", () => {
        opcStreamClients.delete(client);
        clearInterval(client.hb);
        if (opcStreamClients.size === 0) opcStreamStopWatcher();
      });
      return;
    }
    // ---- OPC demo 进展 SSE: GET /api/opc/demo/{id}/stream（Gavin 拍板: 秒级实时性唯一场景走 SSE, 不用 WebSocket）----
    // 状态变更推送; status.json 即事件事实源。终态推送后服务端关闭, 客户端据此断开 EventSource。
    const demoStream = u.pathname.match(/^\/api\/opc\/demo\/([^/]{1,64})\/stream$/);
    if (demoStream && req.method === "GET") {
      stats.reqs++;
      const ip = clientIp(req);
      trackActiveIp(ip);
      const cors = opcCorsHeaders(req);
      if (!apiLimiter(ip)) { stats.blocked++; send(res, 429, { ok: false, error: "too many requests" }, cors); return; }
      const demoId = demoStream[1];
      const s0 = demoReadStatus();
      if (!s0.tasks[demoId]) { send(res, 404, { ok: false, error: "demo not found" }, cors); return; }
      const headers = { ...cors };
      if (headers["Access-Control-Allow-Origin"] == null) delete headers["Access-Control-Allow-Origin"];
      setSSEHeaders(res, headers); // 15a: 与全局流共用公共设施; 帧格式/行为逐字节不变
      let lastSig = "";
      const push = (v) => {
        if (!v) return;
        const sig = `${v.status}|${v.kanban_task_id || ""}|${v.finished_at || ""}`;
        if (sig === lastSig) return; // 去重: 状态无变化不重复推
        lastSig = sig;
        sendEvent(res, "status", v);
      };
      push(demoTaskView(s0, demoId));
      const timer = setInterval(() => {
        const v = demoTaskView(demoReadStatus(), demoId);
        push(v);
        if (v && (v.status === "completed" || v.status === "failed")) {
          clearInterval(timer);
          setTimeout(() => { try { res.end(); } catch {} }, 500); // 终态事件送达后 500ms 关闭
        }
      }, DEMO_SSE_POLL_MS);
      const maxTimer = setTimeout(() => { clearInterval(timer); try { res.end(); } catch {} }, DEMO_SSE_MAX_MS);
      req.on("close", () => { clearInterval(timer); clearTimeout(maxTimer); });
      return;
    }
    // ---- OPC demo/透明办公室 API 跨域预检(12c): www Pages 站跨源 POST(content-type: application/json)
    // 触发 preflight, 现返回 400 导致浏览器拦截; 这里放行白名单来源并返回完整 CORS 头。
    // status/history/SSE 流为简单 GET(无自定义头)不触发 preflight, 由响应 ACAO 放行。
    if (req.method === "OPTIONS" && u.pathname.startsWith("/api/opc/")) {
      const cors = opcCorsHeaders(req);
      if (cors["Access-Control-Allow-Origin"] == null) {
        send(res, 403, { ok: false, error: "forbidden" }, cors);
      } else {
        send(res, 200, { ok: true }, {
          ...cors,
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "600",
        });
      }
      return;
    }
    if (routes[u.pathname]) {
      stats.reqs++;
      const ip = clientIp(req);
      trackActiveIp(ip);
      const cors = u.pathname.startsWith("/api/opc/") ? opcCorsHeaders(req) : corsHeadersFor(req);
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
        const data = await routes[u.pathname](u.searchParams, body, req);
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
    if (p === "/" || p.endsWith("/")) p += "index.html";
    const file = path.join(DIST, path.normalize(p));
    if (file !== DIST && !file.startsWith(DIST + path.sep)) {
      send(res, 403, { ok: false });
      return;
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        // 带扩展名的资源未命中: 直接 404, 不回退 index.html(避免 200+HTML 伪装成 JS/CSS)
        if (path.extname(file)) return send(res, 404, { ok: false, error: "not found" });
        // 目录路径(如 /company 不带尾斜杠): 先试目录内 index.html, 再 SPA fallback
        fs.readFile(path.join(file, "index.html"), (e3, dirHtml) => {
          if (!e3) {
            const h = {
              "Content-Type": "text/html; charset=utf-8",
              ...STATIC_HEADERS,
            };
            h["Content-Security-Policy"] = u.pathname.startsWith("/company") ? COMPANY_CSP : CSP;
            res.writeHead(200, h);
            return res.end(dirHtml);
          }
          fs.readFile(path.join(DIST, "index.html"), (e2, html) => {
            if (e2) return send(res, 404, { ok: false });
            res.writeHead(200, {
              "Content-Type": "text/html; charset=utf-8",
              "Content-Security-Policy": CSP,
              ...STATIC_HEADERS,
            });
            res.end(html);
          });
        });
        return;
      }
      const headers = {
        "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Cache-Control": file.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
        ...STATIC_HEADERS,
      };
      if (file.endsWith(".html")) headers["Content-Security-Policy"] = u.pathname.startsWith("/company") ? COMPANY_CSP : CSP;
      // OPC 透明办公室数据跨域读: 仅 www.hermes.cc.cd(Pages 独立站)可读
      if (u.pathname === "/company/opc/status.json") {
        headers["Access-Control-Allow-Origin"] = "https://www.hermes.cc.cd";
        headers["Vary"] = "Origin";
        // 13a 安全加固: CF 边缘短缓存 10s 吸收前端 10s 轮询刷新量(回源率降 ~90%);
        // 浏览器侧同样 10s(2 分钟级数据, 10s 旧无感); s-maxage 对共享缓存生效
        headers["Cache-Control"] = "public, max-age=10, s-maxage=10";
      }
      res.writeHead(200, headers);
      res.end(buf);
    });
  } catch (e) {
    console.error("[server] error:", e?.message || e);
    send(res, 500, { ok: false, error: "internal error" });
  }
});

server.listen(PORT, () => console.log(`[market-cockpit] listening on :${PORT}`));
