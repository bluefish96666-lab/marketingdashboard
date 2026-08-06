// AI 模型定价(Artificial Analysis) + TrakToken 支出指数(TTSI)
"use strict";

module.exports = function createAiModels(ctx) {
  const { fetchText, num, readHistory, writeHistory, bjToday, path, fs } = ctx;
  const AA_API_KEY = process.env.ARTIFICIAL_ANALYSIS_API_KEY || "";
  const MODEL_PRICES_FILE = path.join(__dirname, "..", "data", "model-prices.json");
  const TTSI_CSV_FILE = path.join(__dirname, "..", "data", "ttsi.csv");

  /* ---------------- Artificial Analysis 模型定价(free 层, ~600 模型) ---------------- */
  async function handleAaModels() {
    if (!AA_API_KEY) { const e = new Error("未配置 ARTIFICIAL_ANALYSIS_API_KEY(server/.env)"); e.status = 500; throw e; }
    let models = [];
    try {
      // free 层 100 次/天: 3 页 × 200, 每次上游刷新约 3 次调用, 24h 缓存足够
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
    } catch (e) {
      // 上游失败(429/网络): 用落盘历史兜底, 保证面板不空
      console.error("[aa-models] upstream fail, fallback to history:", e?.message || e);
      const hist = readHistory(MODEL_PRICES_FILE) || {};
      models = Object.entries(hist).map(([slug, h]) => {
        const pts = h?.points || [];
        const last = pts[pts.length - 1] || {};
        // taskCost: 取最近一个有值的点(部分模型最后一天缺 task); intel 同
        let task = null, intel = null;
        for (let i = pts.length - 1; i >= 0; i--) {
          if (pts[i].task != null && task == null) task = pts[i].task;
          if (pts[i].intel != null && intel == null) intel = pts[i].intel;
          if (task != null && intel != null) break;
        }
        return { slug, name: h?.name || slug, vendor: h?.vendor || "", release: "", intel, input: last.i ?? null, output: last.o ?? null, cacheHit: null, taskCost: task };
      }).filter((m) => m.input != null || m.output != null);
      if (!models.length) throw e; // 历史也没有 → 抛原错
      return { models, history: hist, source: "local snapshot (AA upstream unavailable)" };
    }
    // 每日快照积累(与 spot-history 同模式): 供价格趋势线使用, 按日去重
    let history = readHistory(MODEL_PRICES_FILE);
    const today = bjToday();
    for (const m of models) {
      if (m.input == null && m.output == null) continue;
      const arr = history[m.slug] || (history[m.slug] = { name: m.name, vendor: m.vendor, points: [] });
      const last = arr.points[arr.points.length - 1];
      if (last && last.t === today) last.i = m.input, last.o = m.output, last.task = m.taskCost, last.intel = m.intel;
      else arr.points.push({ t: today, i: m.input, o: m.output, task: m.taskCost, intel: m.intel });
      if (arr.points.length > 730) arr.points.splice(0, arr.points.length - 730);
    }
    await writeHistory(MODEL_PRICES_FILE, history, "aa");
    return { models, history, source: "Artificial Analysis free API" };
  }

  /* ---------------- traktoken 支出指数(全量 CSV + RSS 补尾 + 降价事件) ---------------- */
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

  return { handleAaModels, handleSpendIndex };
};
