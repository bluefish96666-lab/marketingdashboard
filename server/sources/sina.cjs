// 新浪快讯 + 股票搜索
"use strict";

module.exports = function createSina(ctx) {
  const { fetchText, fetchTextAny, fetchSinaJson, num, toMarketCode6 } = ctx;
  const { cache, cacheSet, cached, entry, failEntry, quoteBackoff, TTLS } = ctx;

  /* ---------------- 新浪 7x24 快讯 ---------------- */
  function parseNewsItem(it) {
    const raw = it.rich_text || "";
    const m = raw.match(/^【(.+?)】([\s\S]*)$/);
    return {
      id: it.id,
      title: m ? m[1] : "",
      content: m ? m[2] : raw,
      time: it.create_time,
    };
  }

  /* 华尔街见闻快讯(兜底源,全球可达,CORS开放) */
  async function fetchWscnNews(size) {
    const url = `https://api-one-wscn.awtmt.com/apiv1/content/lives?channel=global-channel&limit=${Math.min(size, 50)}`;
    const text = await fetchText(url);
    const json = JSON.parse(text);
    const items = json?.data?.items || [];
    const fmt = (sec) => {
      if (!sec) return "";
      const d = new Date(sec * 1000);
      const p = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    };
    return items
      .filter((it) => it.content_text || it.content)
      .map((it, i) => ({
        id: it.id || it.display_time * 100 + i,
        title: it.title || "",
        content: (it.content_text || it.content || "").replace(/<[^>]+>/g, ""),
        time: fmt(it.display_time),
      }));
  }

  async function handleNews(page, size) {
    const url = `https://zhibo.sina.com.cn/api/zhibo/feed?page=${encodeURIComponent(page)}&page_size=${encodeURIComponent(size)}&zhibo_id=152&tag_id=0`;
    try {
      const json = await fetchSinaJson(url);
      const list = json?.result?.data?.feed?.list || [];
      if (list.length) return list.map(parseNewsItem);
      throw new Error("empty sina feed");
    } catch {
      return fetchWscnNews(size);
    }
  }

  /* 新浪建议码 → 腾讯报价代码(与前端 normalizeWatchTicker 对齐, 不引入新数据商) */
  function sinaFullToQuoteCode(full) {
    const s = String(full || "").trim();
    if (/^(sh|sz|bj)\d{6}$/.test(s)) return s;
    if (/^hk\d{1,5}$/i.test(s)) return `hk${s.slice(2).padStart(5, "0")}`;
    if (/^us[a-z0-9.]{1,10}$/i.test(s)) return `us${s.slice(2).toUpperCase()}`;
    if (/^gb_[a-z0-9.]{1,10}$/i.test(s)) return `us${s.slice(3).toUpperCase()}`;
    return "";
  }

  /* ---------------- 股票搜索(名称/拼音首字母→代码) ---------------- */
  async function handleStockSearch(query) {
    if (!query || query.length < 1) return [];
    const results = [];

    // 1. 新浪搜索(沪深北 + 港股/美股): fetchTextAny 双通道(带 UA, node fetch 被拦时 curl 兜底)
    const sinaUrl = `https://suggest3.sinajs.cn/suggest/type=&key=${encodeURIComponent(query)}`;
    try {
      const text = await fetchTextAny(sinaUrl, { gbk: true });
      const m = text.match(/suggestvalue="([^"]+)"/);
      if (m) {
        for (const part of m[1].split(";")) {
          const f = part.split(",");
          if (f.length < 4) continue;
          const code = sinaFullToQuoteCode(f[3]);
          if (code && !results.some((r) => r.code === code)) {
            results.push({ code, name: f[0], pinyin: f[4] || "" });
          }
        }
      }
    } catch { /* 新浪不可用时降级 */ }

    // 2. 东方财富搜索(覆盖新三板 NEEQ): fetchSinaJson 双通道(带 UA/Referer, curl 兜底)
    const emUrl = `https://searchadapter.eastmoney.com/api/suggest/get?input=${encodeURIComponent(query)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=8`;
    try {
      const emJson = await fetchSinaJson(emUrl, { referer: "https://www.eastmoney.com/" });
      const emData = emJson?.QuotationCodeTable?.Data || [];
      for (const d of emData) {
        const code = d.Code;
        if (!code || !/^\d{6}$/.test(code)) continue;
        // 统一市场前缀映射(镜像前端 toMarketCode); NEEQ 分类视为北交所
        const classify = d.Classify || "";
        const fullCode = classify === "NEEQ" ? `bj${code}` : toMarketCode6(code);
        // 避免与新浪结果重复
        if (!results.some((r) => r.code === fullCode)) {
          results.push({ code: fullCode, name: d.Name || "", pinyin: d.PinYin || "" });
        }
      }
    } catch { /* 东财不可用时降级 */ }

    return results.slice(0, 10);
  }

  return { handleNews, handleStockSearch, sinaFullToQuoteCode };
};
