/**
 * 市场研究驾驶舱 — 数据代理与静态服务器
 * 聚合: 腾讯行情(A股/港股/美股/汇率) · 腾讯板块榜 · 新浪期货(金银铜油)
 *       新浪个股榜单 · 新浪资金流 · 新浪7x24快讯 · CNBC美债收益率
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const iconv = require("iconv-lite");
const { execFile } = require("child_process");
const crypto = require("crypto");
const { num, changeOf, pctOf, fmtHHMM, toMarketCode6 } = require("./lib/format.cjs");
const { parseCsvParam, chunked, safeRecord } = require("./lib/netutil.cjs");
const { bjToday, readHistory, writeHistory } = require("./lib/persist.cjs");
const { createCache } = require("./lib/cache.cjs");
const { cache, set: cacheSet, sweep: sweepCache, backoffOf } = createCache();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// 数据源适配器(依赖注入共享工具)
const srcTencent = require("./sources/tencent.cjs")({
  fetchText, fetchTextAny, curlText, cache, cacheSet, parseCsvParam, chunked, safeRecord, num, changeOf, pctOf,
});
const { handleQuotes, handleMinute, handleBoards, handleBoardStocks } = srcTencent;

const srcFutures = require("./sources/futures.cjs")({
  fetchText, curlText, num, changeOf, pctOf, fmtHHMM, safeRecord,
});
const { handleFutures, handleFutureMinute, handleFutureDaily } = srcFutures;

const srcAi = require("./sources/ai.cjs")({});
const { handleMysterySelect } = srcAi;

const srcEastmoney = require("./sources/eastmoney.cjs")({
  fetchText, fetchTextAny, curlText, cache, cacheSet, num, toMarketCode6, sleep,
});
const { handleRank, handleMoneyFlow, handleStockBoards, handleMoneyFlowEM, handleStockFlows, handleBoardFlow, fetchSinaJson } = srcEastmoney;

const srcSina = require("./sources/sina.cjs")({ fetchText, fetchSinaJson, num, toMarketCode6, UA });
const { handleNews, handleStockSearch } = srcSina;

const srcEastmoneyFin = require("./sources/eastmoney-fin.cjs")({
  fetchTextAny, num, toMarketCode6,
});
const { handleFinanceMain, handleFinanceBoard, handleFinanceForecast, validPeriod } = srcEastmoneyFin;

const srcTreasuries = require("./sources/treasuries.cjs")({ fetchTextAny, num, fs, path });
const { handleTreasuries, handleTreasuryHistory } = srcTreasuries;

const srcOpenRouter = require("./sources/openrouter.cjs")({ safeRecord, fs, path });
const { handleOpenRouterUsage } = srcOpenRouter;

// 个股资金流上游 inflight 去重表(handleStockFlows 使用)
const flowInflight = new Map();

// 加载 .env
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

// 运行观测(压测/运维): 仅聚合计数, 无敏感信息; /api/stats 读取
const stats = { reqs: 0, upstream: 0, blocked: 0, started: Date.now() };
// 活跃访客窗口: ip -> 最近请求时间戳; /api/stats 暴露 activeIps5m / visitors24h
const activeIps = new Map(); // ip -> lastSeen(ms), 24h 内访问过的 IP 保留(个人站点量级, 内存有界)
const activeSweeper = setInterval(() => {
  const cutoff = Date.now() - 24 * 3600 * 1000;
  for (const [ip, last] of activeIps) if (last < cutoff) activeIps.delete(ip);
}, 5 * 60 * 1000);
activeSweeper.unref();
function trackActiveIp(ip) { activeIps.set(ip, Date.now()); }

function curlText(url, { referer, timeout = 8000, encoding = "gbk", headers } = {}) {
  stats.upstream++; // 上游调用计数(fetchText/curlText 是所有上游 fetch 的唯一出口)
  return new Promise((resolve, reject) => {
    // -sS: 静默进度但保留错误信息到 stderr, 失败原因可诊断(28=超时, 35=TLS握手, 6=DNS...)
    const args = ["-sS", "--max-time", String(Math.ceil(timeout / 1000)), "-H", `User-Agent: ${UA}`];
    if (referer) args.push("-H", `Referer: ${referer}`);
    for (const [k, v] of Object.entries(headers || {})) args.push("-H", `${k}: ${v}`);
    args.push(url);
    execFile("curl", args, { maxBuffer: 4 * 1024 * 1024, encoding: "buffer" }, (err, stdout, stderr) => {
      if (err) {
        const detail = stderr && stderr.length ? String(stderr).trim().slice(0, 200) : err.message;
        return reject(new Error(`curl(${err.code ?? "?"}) ${url} -> ${detail}`));
      }
      resolve(iconv.decode(stdout, encoding));
    });
  });
}

const PORT = process.env.PORT || 3000;
const DIST = path.join(__dirname, "..", "dist");

/* ---------------- 基础工具 ---------------- */
async function fetchText(url, { referer, gbk = false, timeout = 8000, headers } = {}) {
  stats.upstream++;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const h = { "User-Agent": UA, Accept: "*/*", ...headers };
    if (referer) h["Referer"] = referer;
    const resp = await fetch(url, { headers: h, signal: ctrl.signal });
    const buf = Buffer.from(await resp.arrayBuffer());
    return gbk ? iconv.decode(buf, "gbk") : buf.toString("utf-8");
  } finally {
    clearTimeout(timer);
  }
}

/* node fetch 被拦/失败时回退 curl(与 emGet / fetchSinaJson 同模式);
   适用于对 TLS 指纹敏感、对 node fetch 间歇性断连的上游(CNBC 等) */
async function fetchTextAny(url, { referer, gbk = false, timeout = 8000 } = {}) {
  try {
    return await fetchText(url, { referer, gbk, timeout });
  } catch {
    return curlText(url, { referer, timeout, encoding: gbk ? "gbk" : "utf-8" });
  }
}

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

/* ---------------- TTL 缓存 + 并发合并(防上游限流) ---------------- */
async function cached(key, ttl, fn) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit) {
    if (hit.data !== undefined && now - hit.ts < ttl) return hit.data;
    if (hit.inflight) return hit.inflight;
    // 失败退避窗口内: 有旧数据降级返回, 无旧数据直接抛错 — 都不再打上游(负缓存)
    if (hit.failAt != null && now - hit.failAt < backoffOf(hit.failCount)) {
      if (hit.data !== undefined) return hit.data;
      throw new Error("upstream degraded");
    }
  }
  const inflight = fn()
    .then((data) => {
      cacheSet(key, { ts: Date.now(), data, inflight: null, ttl, failAt: null, failCount: 0 });
      return data;
    })
    .catch((e) => {
      const c = cache.get(key);
      cacheSet(key, { ts: c?.ts || 0, data: c?.data, inflight: null, ttl, failAt: Date.now(), failCount: (c?.failCount || 0) + 1 });
      if (c?.data !== undefined) return c.data; // 出错回退到旧数据
      throw e;
    });
  cacheSet(key, { ts: hit?.ts || 0, data: hit?.data, inflight, ttl, failAt: hit?.failAt ?? null, failCount: hit?.failCount ?? 0 });
  return inflight;
}

/* ---------------- 生意社现期对照表(现货价/期货价/基差) + 现货历史积累 ---------------- */
const SPOT_DATA_FILE = path.join(__dirname, "data", "spot-history.json");

// 生意社华为云 HW_CHECK 质询绕过: 质询页 JS 内嵌 cookie 值, 提取后带 cookie 重试
async function fetchSunsir(url, { timeout = 12000 } = {}) {
  const once = (cookie) => {
    const headers = { "User-Agent": UA, Accept: "text/html" };
    if (cookie) headers.Cookie = cookie;
    return fetch(url, { headers, signal: AbortSignal.timeout(timeout) });
  };
  let resp = await once();
  let text = await resp.text();
  if (text.length < 4000 && text.includes("HW_CHECK")) {
    const m = text.match(/=\s*"([0-9a-f]{16,})"/);
    if (m) {
      resp = await once(`HW_CHECK=${m[1]}`);
      text = await resp.text();
    }
  }
  if (text.includes("HW_CHECK") && text.length < 4000) throw new Error("sunsir waf challenge failed");
  return text;
}

function parseSfTable(html) {
  const parts = html.split(/<td colspan="8"[^>]*>([^<]+)<\/td>/i);
  const rows = [];
  for (let i = 1; i < parts.length; i += 2) {
    const exchange = parts[i];
    const body = parts[i + 1] || "";
    const chunks = body.split(/<tr[^>]*bgcolor="#fafdff"[^>]*>/i);
    for (let c = 1; c < chunks.length; c++) {
      let chunk = chunks[c];
      // 嵌套 table 内的 font 值依次为 基差1/基差率1/基差2/基差率2
      const fonts = [...chunk.matchAll(/<font[^>]*>(-?[\d.,]+%?)<\/font>/g)].map((m) => m[1]);
      chunk = chunk.replace(/<table[\s\S]*?<\/table>/g, "");
      const cells = [...chunk.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
        .map((m) => m[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, "").trim())
        .filter((v) => v !== "");
      if (cells.length < 4 || !cells[0]) continue;
      const basisPct1 = parseFloat(fonts[1]);
      rows.push({
        exchange,
        name: cells[0],
        spot: num(cells[1]),
        contract: cells[2] || "",
        futures: num(cells[3]),
        basis: num(fonts[0]),
        basisPct: Number.isFinite(basisPct1) ? basisPct1 : 0,
      });
    }
  }
  return rows;
}

async function handleSpotTable() {
  const html = await fetchSunsir("https://www.100ppi.com/sf/");
  const dm = html.match(/20\d{2}年\d{1,2}月\d{1,2}日/);
  const date = dm ? dm[0].replace(/[年月]/g, "-").replace("日", "") : new Date().toISOString().slice(0, 10);
  const rows = parseSfTable(html);
  if (!rows.length) throw new Error("sunsir sf table parse empty");
  // 现货价按日积累(与 openrouter-usage 同模式), 供现货趋势线使用
  let history = readHistory(SPOT_DATA_FILE);
  const today = bjToday();
  for (const r of rows) {
    if (!r.spot) continue;
    const arr = history[r.name] || (history[r.name] = []);
    if (arr.length && arr[arr.length - 1].t === today) arr[arr.length - 1].p = r.spot;
    else arr.push({ t: today, p: r.spot });
    if (arr.length > 400) arr.splice(0, arr.length - 400);
  }
  await writeHistory(SPOT_DATA_FILE, history, "spot");
  return { date, rows, history };
}

/* ---------------- Artificial Analysis 模型定价(free 层, ~600 模型) ---------------- */
const AA_API_KEY = process.env.ARTIFICIAL_ANALYSIS_API_KEY || "";
const MODEL_PRICES_FILE = path.join(__dirname, "data", "model-prices.json");

async function handleAaModels() {
  if (!AA_API_KEY) { const e = new Error("未配置 ARTIFICIAL_ANALYSIS_API_KEY(server/.env)"); e.status = 500; throw e; }
  // free 层 100 次/天: 3 页 × 200, 每次上游刷新约 3 次调用, 24h 缓存足够
  const models = [];
  let page = 1;
  let hasMore = true;
  while (hasMore && page <= 4) {
    const j = JSON.parse(
      await fetchText(`https://artificialanalysis.ai/api/v2/language/models/free?page=${page}&page_size=200`, {
        referer: "https://artificialanalysis.ai/",
        headers: { "x-api-key": AA_API_KEY },
      })
    );
    for (const d of j.data || []) {
      const intelCost = d.artificial_analysis_intelligence_index_cost;
      models.push({
        slug: d.slug,
        name: d.name,
        vendor: d.model_creator?.name || "",
        release: d.release_date || "",
        intel: d.evaluations?.artificial_analysis_intelligence_index ?? null,
        input: d.pricing?.price_1m_input_tokens ?? null,
        output: d.pricing?.price_1m_output_tokens ?? null,
        cacheHit: d.pricing?.price_1m_cache_hit_tokens ?? null,
        taskCost: intelCost?.cost_per_task?.total_cost ?? null,
      });
    }
    hasMore = j.pagination?.has_more === true;
    page++;
  }
  // 每日快照积累(与 spot-history 同模式): 供价格趋势线使用, 按日去重
  let history = readHistory(MODEL_PRICES_FILE);
  const today = bjToday();
  for (const m of models) {
    if (m.input == null && m.output == null) continue;
    const arr = history[m.slug] || (history[m.slug] = { name: m.name, vendor: m.vendor, points: [] });
    const last = arr.points[arr.points.length - 1];
    if (last && last.t === today) last.i = m.input, last.o = m.output, last.task = m.taskCost;
    else arr.points.push({ t: today, i: m.input, o: m.output, task: m.taskCost });
    if (arr.points.length > 730) arr.points.splice(0, arr.points.length - 730);
  }
  await writeHistory(MODEL_PRICES_FILE, history, "aa");
  return { models, history, source: "Artificial Analysis free API" };
}

/* ---------------- traktoken 支出指数(全量 CSV + RSS 补尾 + 降价事件) ---------------- */
const TTSI_CSV_FILE = path.join(__dirname, "data", "ttsi.csv");

/** 解析 ttsi.csv(CC BY 4.0, 列: date,ttsi,ma7,spend_price_usd,ma7,f... 见文件头注释) */
function parseTtsiCsv(text) {
  const points = [];
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const f = line.split(",");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f[0] || "")) continue;
    points.push({
      date: f[0],
      ttsi: num(f[3]),     // spend_price_usd 全市场用量加权价
      indexPoint: num(f[1]), // ttsi 指数点位
      closed: num(f[6]),   // spend_price_f_usd 闭源前沿价
      open: num(f[8]),     // spend_price_o_usd 开源权重价
      premium: num(f[9]),  // frontier_premium 前沿溢价
      pct: null,
    });
  }
  return points;
}

async function handleSpendIndex() {
  // 全量历史: 本地 ttsi.csv 优先, RSS 提供事件流 + 补齐 CSV 之后的新日期
  let csvPoints = [];
  try {
    csvPoints = parseTtsiCsv(fs.readFileSync(TTSI_CSV_FILE, "utf-8"));
  } catch (e) { console.error("[ttsi] csv read error:", e?.message || e); }
  const csvDates = new Set(csvPoints.map((p) => p.date));

  const text = await fetchText("https://www.traktoken.com/spend-index/feed.xml", { referer: "https://www.traktoken.com/" });
  const rssPoints = [];
  const events = [];
  for (const m of text.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const strip = (tag) => (it.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [,""])[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();
    const title = strip("title");
    const desc = strip("description");
    const dm = title.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!dm) continue;
    const ttsi = title.match(/\$([\d.]+)\/M/);
    const pct = title.match(/([+-][\d.]+)%/);
    rssPoints.push({
      date: dm[1],
      ttsi: ttsi ? parseFloat(ttsi[1]) : null,
      pct: pct ? parseFloat(pct[1]) : null,
      indexPoint: num(desc.match(/指数点位\s*([\d.]+)/)?.[1]),
      closed: num(desc.match(/闭源前沿\s*\$([\d.]+)\/M/)?.[1]),
      open: num(desc.match(/开源权重\s*\$([\d.]+)\/M/)?.[1]),
      premium: num(desc.match(/前沿溢价\s*([\d.]+)\s*倍/)?.[1]),
    });
    // 事件标注: 标题第 3 段(降幅/份额变动), 如 "GPT-5.6 Luna (max) 降价 80%"
    const parts = title.split("·").map((s) => s.trim());
    if (parts.length >= 3 && !parts[2].startsWith("TTSI")) events.push({ date: dm[1], text: parts[2] });
  }
  events.reverse(); // RSS 最新在前, 翻转为时间升序

  const merged = [...csvPoints, ...rssPoints.filter((p) => !csvDates.has(p.date))].sort((a, b) => (a.date < b.date ? -1 : 1));
  return { points: merged, events, source: "TrakToken TTSI 全量(CC BY 4.0)" };
}

/* ---------------- 生意社化工现货(报价中心 plist 页, 中位数为代表价) ---------------- */
async function handleChemSpot(id, name) {
  if (!/^\d{1,10}$/.test(id)) { const e = new Error("bad id"); e.status = 400; throw e; }
  name = String(name || id).slice(0, 40); // name 来自用户输入并写入历史文件, 限长
  const html = await fetchSunsir(`https://www.100ppi.com/mprice/plist-1-${encodeURIComponent(id)}-1.html`);
  // 行结构: 品名/规格/产地/价格(元/吨)/价格类型/交货地/企业/日期
  const market = []; // 市场价(真实行情)
  const all = [];
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const row = m[1];
    const pm = row.match(/>\s*([\d.]+)\s*元\/吨\s*</);
    if (!pm || !row.includes("p-name")) continue;
    const p = num(pm[1]);
    all.push(p);
    if (row.includes("市场价")) market.push(p);
  }
  if (!all.length) throw new Error("chem spot parse empty");
  // 优先市场价中位数(出厂价多为厂商挂高价); 无市场价则全体中位数
  const pool = market.length ? market : all;
  pool.sort((a, b) => a - b);
  const mid = pool.length >> 1;
  const price = pool.length % 2 ? pool[mid] : +((pool[mid - 1] + pool[mid]) / 2).toFixed(2);
  const dm = html.match(/>(20\d{2}-\d{2}-\d{2})</);
  // 历史积累(与现货表同一文件); 条目总数有界, 防止恶意 name 缓慢填满磁盘
  let history = readHistory(SPOT_DATA_FILE);
  const today = bjToday();
  if (name === "__proto__" || name === "constructor" || name === "prototype") {
    throw Object.assign(new Error("invalid name"), { status: 400 }); // 防原型污染键写盘
  }
  let arr = history[name];
  if (!arr && Object.keys(history).length < 500) arr = history[name] = [];
  if (arr) {
    if (arr.length && arr[arr.length - 1].t === today) arr[arr.length - 1].p = price;
    else arr.push({ t: today, p: price });
    if (arr.length > 400) arr.splice(0, arr.length - 400);
    await writeHistory(SPOT_DATA_FILE, history, "chem-spot");
  }
  return { id, name, price, quotes: all.length, date: dm ? dm[1] : today, history: arr || [] };
}

/* ---------------- 现货每日定时采集(服务端自驱, 无需前端在线) ---------------- */
// 与前端 src/config/goods.ts 的 CHEM_SPOTS 保持一致
const CHEM_SPOT_SEEDS = [["7250", "碳酸亚乙烯酯"]];

async function collectSpotDaily() {
  try {
    await handleSpotTable();
    console.log("[spot] 定时采集: 现期表完成");
  } catch (e) { console.error("[spot] 定时采集: 现期表失败:", e?.message || e); }
  for (const [id, name] of CHEM_SPOT_SEEDS) {
    try {
      await handleChemSpot(id, name);
      console.log("[spot] 定时采集: 化工现货", name, "完成");
    } catch (e) { console.error("[spot] 定时采集: 化工现货", name, "失败:", e?.message || e); }
  }
}
// 生意社交易日 16:30 更新, 每 4 小时采集一轮保证覆盖; unref 不阻止进程退出
setInterval(collectSpotDaily, 4 * 3600 * 1000).unref();
// 启动 1 分钟后先补一轮(部署当日即有数据)
setTimeout(collectSpotDaily, 60 * 1000).unref();

/* ------------------------------------------------------------- */

/* ---------------- 产业链股票解析(本地正则,无需LLM) ---------------- */
function handleChainParse(body) {
  const { name = "", content = "" } = body || {};
  const warnings = [];

  if (!content.trim()) {
    return { name, source: "local", segments: [], warnings: ["content is empty"] };
  }

  // 尝试按 iWenCai 段落标题分段: 上游·材料/设备、中游·制造/封测、下游·应用/终端
  const sectionHeaders = [
    { key: "上游", name: "上游·材料/设备", desc: "原材料、设备与零部件等上游环节" },
    { key: "中游", name: "中游·制造/封测", desc: "代工、制造与封测等中游环节" },
    { key: "下游", name: "下游·应用/终端", desc: "应用、终端与整车等下游客群" },
  ];

  // 提取股票代码: 支持 NAME(CODE.SZ) 和 CODE NAME 两种格式
  const stocksFromText = (text) => {
    const results = [];
    const seen = new Set();
    // 给代码加上市场前缀(统一映射)
    const prefixed = (code) => toMarketCode6(code.replace(/\D/g, "").slice(-6).padStart(6, "0"));
    // 格式1: 中文名称（CODE.SH/SZ/BJ）或 中文名称(CODE)
    const re1 = /([\u4e00-\u9fa5]{2,6})[（(]\s*(?:sh|sz|bj)?(\d{6})[^）)]*[）)]/gi;
    let m;
    while ((m = re1.exec(text)) !== null) {
      const code = prefixed(m[2]);
      const key = `${code}:${m[1]}`;
      if (!seen.has(key)) { seen.add(key); results.push({ code, name: m[1] }); }
    }
    // 格式2: CODE.SH/SZ/BJ 中文名称 或 CODE 中文名称
    const re2 = /(?:sh|sz|bj)?(\d{6})\s*([\u4e00-\u9fa5]{2,6})/g;
    while ((m = re2.exec(text)) !== null) {
      const code = prefixed(m[1]);
      const key = `${code}:${m[2]}`;
      if (!seen.has(key)) { seen.add(key); results.push({ code, name: m[2] }); }
    }
    return results;
  };

  // 先按段落标题切分
  const lines = content.split("\n");
  let currentSection = -1; // -1 = 未进入任何段落
  const sectionTexts = ["", "", ""];

  for (const line of lines) {
    const trimmed = line.trim();
    for (let i = 0; i < sectionHeaders.length; i++) {
      if (trimmed.includes(sectionHeaders[i].key) && (trimmed.includes("上游") || trimmed.includes("中游") || trimmed.includes("下游"))) {
        // 检查是否真的是段落标题（包含材料/制造/应用或类似关键词，或只有标题没有股票）
        if (trimmed.length < 20 || !trimmed.match(/[\u4e00-\u9fa5]{2,6}[（(]\s*\d{4}/)) {
          currentSection = i;
          break;
        }
      }
    }
    if (currentSection >= 0 && currentSection < 3) {
      // 跳过标题行本身
      if (!trimmed.includes(sectionHeaders[currentSection].key) || trimmed.length < 15) {
        sectionTexts[currentSection] += "\n" + trimmed;
      }
    }
  }

  // 如果段落切分成功（至少两段有股票），用段落方式
  const segments = sectionHeaders.map((header, i) => {
    const stocks = sectionTexts[i] ? stocksFromText(sectionTexts[i]) : [];
    return { name: header.name, desc: header.desc, stocks: stocks.slice(0, 10) };
  });

  const totalBySections = segments.reduce((s, seg) => s + seg.stocks.length, 0);

  // 段落切分不理想时，回退：全文提取 + 关键词匹配
  if (totalBySections < 3) {
    const allStocks = stocksFromText(content);
    if (allStocks.length === 0) {
      return { name, source: "local", segments: [], warnings: ["未从文本中提取到任何A股股票"] };
    }

    // 按股票名称关键词分配到三段
    const segmentKeywords = [
      { keywords: ["材料", "设备", "原料", "矿产", "化工", "硅", "锂", "稀土", "靶材", "晶圆", "气体", "试剂", "新材", "半导体", "芯片", "元器件", "元件", "部件", "模组"] },
      { keywords: ["代工", "制造", "封测", "组装", "加工", "铸造", "冶炼", "封装", "测试", "PCB", "面板", "光伏", "绿能", "电池", "电芯", "电机", "集成", "系统"] },
      { keywords: ["应用", "终端", "整车", "车企", "汽车", "消费", "手机", "电脑", "服务器", "机器人", "无人机", "储能", "运营", "服务", "互联网", "平台", "AI", "智能", "数据", "软件", "方案", "车"] },
    ];

    const unassigned = [...allStocks];
    const fallbackSegments = segmentKeywords.map((rule) => {
      const stocks = [];
      for (let i = unassigned.length - 1; i >= 0; i--) {
        if (stocks.length >= 10) break;
        if (rule.keywords.some((kw) => unassigned[i].name.includes(kw))) {
          stocks.push(unassigned[i]);
          unassigned.splice(i, 1);
        }
      }
      stocks.reverse();
      return stocks;
    });

    if (unassigned.length > 0 && unassigned.length < allStocks.length) {
      warnings.push(`${unassigned.length} 只股票未能匹配产业链关键词: ${unassigned.map(s => s.name).join("、")}`);
    }

    return {
      name, source: "local",
      segments: sectionHeaders.map((h, i) => ({ name: h.name, desc: h.desc, stocks: fallbackSegments[i] })),
      warnings,
    };
  }

  return { name, source: "local", segments, warnings };
}

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
        // 内部细节只记日志; err.status 由可预期的业务错误(如队列满)携带, 其 message 可安全回显
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
