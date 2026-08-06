// OpenRouter 大模型 Token 消耗量(厂商聚合)
"use strict";

module.exports = function createOpenRouter(ctx) {
  const { safeRecord, fs, path } = ctx;
  const OR_KEY = process.env.OPENROUTER_API_KEY || ""; // .env 在 index.cjs 顶部统一加载
  const OR_DATA_FILE = path.join(__dirname, "..", "data", "openrouter-usage.json");

  const VENDOR_MAP = {
    openai: "OpenAI", anthropic: "Anthropic", google: "Google",
    deepseek: "DeepSeek", qwen: "通义千问", minimax: "MiniMax",
    "z-ai": "智谱GLM", moonshotai: "月之暗面", stepfun: "阶跃星辰",
    xiaomi: "小米", tencent: "腾讯", nvidia: "NVIDIA",
    "meta-llama": "Meta", mistralai: "Mistral", cohere: "Cohere", "x-ai": "xAI",
    poolside: "Poolside", meituan: "美团", "nex-agi": "nex-agi",
    inclusionai: "inclusionai", bytedance: "字节跳动", baai: "BAAI",
    perplexity: "Perplexity",
  };

  function vendorSlug(slug) {
    if (slug === "other") return "其他";
    const p = slug.split("/")[0];
    return VENDOR_MAP[p] || p;
  }

  const COUNTRY_MAP = {
    "腾讯":"🇨🇳中国","小米":"🇨🇳中国","DeepSeek":"🇨🇳中国","智谱GLM":"🇨🇳中国",
    "月之暗面":"🇨🇳中国","MiniMax":"🇨🇳中国","阶跃星辰":"🇨🇳中国","通义千问":"🇨🇳中国","美团":"🇨🇳中国","nex-agi":"🇨🇳中国","字节跳动":"🇨🇳中国","BAAI":"🇨🇳中国",
    "OpenAI":"🇺🇸美国","Anthropic":"🇺🇸美国","Google":"🇺🇸美国","Meta":"🇺🇸美国",
    "NVIDIA":"🇺🇸美国","xAI":"🇺🇸美国","Cohere":"🇺🇸美国","Poolside":"🇺🇸美国","inclusionai":"🇺🇸美国","Perplexity":"🇺🇸美国",
  };

  function country(name) { return COUNTRY_MAP[name] || "🌍其他"; }

  async function handleOpenRouterUsage() {
    // 读取本地缓存（持久化存储，不断积累）
    let cached = [];
    try { cached = JSON.parse(fs.readFileSync(OR_DATA_FILE, "utf-8") || "[]"); } catch {}
    const cachedDates = new Set(cached.map((r) => r.date));

    // 确定需要拉取的日期范围
    const today = new Date();
    const todayStr = new Date(today - 86400000).toISOString().slice(0, 10); // API 数据至少次日才可用
    let fetchRanges = [];
    const earliest = "2025-01-01";
    if (cached.length === 0) {
      // 首次运行：分段拉取，每段不超过 366 天
      const maxSpan = 200;
      let s = new Date(earliest);
      while (s < today) {
        const e = new Date(s);
        e.setDate(e.getDate() + maxSpan - 1);
        const end = e < today ? e : new Date(today - 86400000);
        fetchRanges.push({ start: s.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) });
        s.setDate(s.getDate() + maxSpan);
      }
    } else {
      // 已有缓存：从最新数据次日开始，补到昨天
      const lastDate = cached.reduce((a, b) => a.date > b.date ? a : b).date;
      const nextDay = new Date(lastDate);
      nextDay.setDate(nextDay.getDate() + 1);
      const start = nextDay.toISOString().slice(0, 10);
      if (start < todayStr) fetchRanges.push({ start, end: todayStr });
    }

    if (fetchRanges.length === 0) return cached;

    try {
      for (const { start, end } of fetchRanges) {
        const url = `https://openrouter.ai/api/v1/datasets/rankings-daily?start_date=${start}&end_date=${end}`;
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${OR_KEY}`, Accept: "application/json" }, signal: AbortSignal.timeout(120000) });
        if (!resp.ok) throw new Error(`HTTP ${resp.status} ${start}~${end}`);
        const body = await resp.json();
        const rows = body?.data || [];

        // 按日期+厂商聚合 token
        const byDV = safeRecord(); // 无原型对象, 防上游 slug 为 __proto__ 时污染
        for (const r of rows) {
          const dt = r.date, v = vendorSlug(r.model_permaslug);
          if (cachedDates.has(dt)) continue;
          if (!byDV[dt]) byDV[dt] = {};
          byDV[dt][v] = (byDV[dt][v] || 0n) + BigInt(Math.round(Number(r.total_tokens) || 0)); // 上游可能返回浮点/字符串, 直接 BigInt() 会 throw
        }

        for (const [dt, vMap] of Object.entries(byDV)) {
          const total = Object.values(vMap).reduce((a, b) => a + b, 0n);
          const providers = Object.entries(vMap).map(([name, tokens]) => ({
            name, tokens: Number(tokens),
            pct: Number((tokens * 10000n / total)) / 100,
          })).sort((a, b) => b.tokens - a.tokens);
          const byCountry = {};
          for (const p of providers) {
            const c = country(p.name);
            byCountry[c] = (byCountry[c] || 0n) + BigInt(p.tokens);
          }
          const countries = Object.entries(byCountry).map(([name, tokens]) => ({
            name, tokens: Number(tokens),
            pct: Number((tokens * 10000n / total)) / 100,
          })).sort((a, b) => b.tokens - a.tokens);
          cached.push({ date: dt, total: Number(total), providers, countries });
        }
      }

      cached.sort((a, b) => a.date.localeCompare(b.date));
      try {
        fs.mkdirSync(path.dirname(OR_DATA_FILE), { recursive: true });
        await fs.promises.writeFile(OR_DATA_FILE, JSON.stringify(cached)); // 异步写, 不阻塞事件循环
      } catch (e) {
        console.error("[or-usage] save error:", e?.message || e); // 落盘失败不影响主流程
      }
      return cached;
    } catch (e) {
      console.error("[or-usage] fetch error:", e?.message || e);
      if (cached.length) return cached;
      return [{ date: todayStr, total: 0, providers: [], countries: [] }];
    }
  }

  return { handleOpenRouterUsage };
};
