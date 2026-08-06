// 生意社现货源 — 现期对照表 + 化工现货 + 每日定时采集
"use strict";

module.exports = function createSunsirs(ctx) {
  const { fetchText, num, UA, readHistory, writeHistory, bjToday, path, fs } = ctx;
  const SPOT_DATA_FILE = path.join(__dirname, "..", "data", "spot-history.json");

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

  return { handleSpotTable, handleChemSpot };
};
