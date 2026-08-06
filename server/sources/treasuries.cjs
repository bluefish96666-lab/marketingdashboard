// CNBC 美债收益率 + 本地存档历史曲线
"use strict";

module.exports = function createTreasuries(ctx) {
  const { fetchTextAny, num, fs, path } = ctx;

  /* ---------------- CNBC 美债收益率 ---------------- */
  const TREASURY_SYMBOLS = ["US3M", "US6M", "US1Y", "US2Y", "US3Y", "US5Y", "US7Y", "US10Y", "US20Y", "US30Y"];
  async function handleTreasuries() {
    const url = `https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=${TREASURY_SYMBOLS.join("|")}&requestMethod=quick&noform=1&partnerId=2&fund=1&output=json`;
    const text = await fetchTextAny(url); // CNBC 对 node fetch 间歇断连, fetch/curl 双通道
    const json = JSON.parse(text);
    const list = json?.FormattedQuoteResult?.FormattedQuote || [];
    return list
      .filter((q) => q.code === 0 && q.last)
      .map((q) => ({
        symbol: q.symbol,
        name: q.shortName || q.name,
        yield: num(String(q.last).replace("%", "")),
        change: num(q.change),
        time: q.last_time,
      }));
  }

  /* ---------------- 美债收益率历史曲线(近10年月度曲线: 本地存档 + 当年在线补充) ---------------- */
  const TREASURY_CSV_COLS = {
    US3M: "3 Mo", US6M: "6 Mo", US1Y: "1 Yr", US2Y: "2 Yr", US3Y: "3 Yr",
    US5Y: "5 Yr", US7Y: "7 Yr", US10Y: "10 Yr", US20Y: "20 Yr", US30Y: "30 Yr",
  };
  // 完整年份官方存档随代码库分发(scripts/update-treasury-archive.cjs 生成), 数据不再变化
  const TREASURY_ARCHIVE_DIR = path.join(__dirname, "..", "treasury-rates");
  let treasuryArchiveCache = null; // 解析一次, 进程内常驻

  // 解析一年份 CSV 到 byMonth(首列 MM/DD/YYYY 降序; 每月首个命中即该月最后一个交易日)
  function parseTreasuryCsv(text, byMonth) {
    const lines = text.trim().split(/\r?\n/);
    const header = lines[0].split(",").map((h) => h.replace(/"/g, ""));
    const colIdx = Object.fromEntries(TREASURY_SYMBOLS.map((s) => [s, header.indexOf(TREASURY_CSV_COLS[s])]));
    for (const line of lines.slice(1)) {
      const f = line.split(",");
      const m = f[0].match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (!m) continue;
      const key = `${m[3]}-${m[1]}`;
      if (byMonth.has(key)) continue;
      const yields = {};
      for (const s of TREASURY_SYMBOLS) {
        const idx = colIdx[s];
        if (idx >= 0) yields[s] = num(f[idx]); // 列缺失则缺省(前端要求全期限齐整才采用该曲线), 不静默造 0
      }
      byMonth.set(key, { date: `${m[3]}-${m[1]}-${m[2]}`, yields });
    }
  }

  function loadTreasuryArchive() {
    if (treasuryArchiveCache) return treasuryArchiveCache;
    const byMonth = new Map();
    try {
      for (const f of fs.readdirSync(TREASURY_ARCHIVE_DIR)) {
        if (!/^\d{4}\.csv$/.test(f)) continue;
        try {
          parseTreasuryCsv(fs.readFileSync(path.join(TREASURY_ARCHIVE_DIR, f), "utf-8"), byMonth);
        } catch (e) {
          console.error("[treasury-history] 存档解析失败:", f, e?.message || e);
        }
      }
      console.log(`[treasury-history] 本地存档加载: ${byMonth.size} 个月度曲线`);
    } catch (e) {
      console.error("[treasury-history] 存档目录读取失败:", e?.message || e);
    }
    treasuryArchiveCache = byMonth;
    return byMonth;
  }

  async function handleTreasuryHistory() {
    // 复制存档, 当年在线数据不污染常驻缓存
    const byMonth = new Map(loadTreasuryArchive());
    const year = new Date().getFullYear();
    // 当年数据仍在增长, 在线补充(跨境慢且不稳, 30s 超时; 失败时降级为纯存档)
    try {
      const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&_format=csv`;
      parseTreasuryCsv(await fetchTextAny(url, { timeout: 30000 }), byMonth);
    } catch (e) {
      console.error(`[treasury-history] ${year} 在线拉取失败, 使用本地存档:`, e?.message || e);
    }
    // 存档全量返回(2001 年至今), 同期月份过滤与高亮由前端按当前月份处理
    const out = [...byMonth.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([, v]) => v);
    if (!out.length) throw new Error("treasury history unavailable");
    return out;
  }

  return { handleTreasuries, handleTreasuryHistory };
};
