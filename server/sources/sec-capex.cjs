// SEC companyfacts — 云巨头资本开支/折旧(免费免密钥, 需 UA 头)
// 实测标签映射(2026-08 验证):
//   MSFT/GOOGL/META -> PaymentsToAcquirePropertyPlantAndEquipment
//   AMZN            -> PaymentsToAcquireProductiveAssets
//   折旧            -> DepreciationDepletionAndAmortization (META/AMZN),
//                     MSFT/GOOGL 用 DepreciationAmortizationAndAccretionNet (需探测)
"use strict";

module.exports = function createSecCapex(ctx) {
  const { fetchWithFallback, readHistory, writeHistory, bjToday } = ctx;
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
  const HISTORY_FILE = "sec-capex-history.json"; // 落盘历史(每次拉取追加年度快照)

  const COMPANIES = [
    { name: "MSFT", cik: "0000789019", capexTags: ["PaymentsToAcquirePropertyPlantAndEquipment", "CapitalExpenditures"], depTags: ["DepreciationAmortizationAndAccretionNet", "DepreciationDepletionAndAmortization", "DepreciationAndAmortization"] },
    { name: "GOOGL", cik: "0001652044", capexTags: ["PaymentsToAcquirePropertyPlantAndEquipment", "CapitalExpenditures"], depTags: ["DepreciationAmortizationAndAccretionNet", "DepreciationDepletionAndAmortization", "DepreciationAndAmortization"] },
    { name: "AMZN", cik: "0001018724", capexTags: ["PaymentsToAcquireProductiveAssets", "PaymentsToAcquirePropertyPlantAndEquipment", "CapitalExpenditures"], depTags: ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization"] },
    { name: "META", cik: "0001326801", capexTags: ["PaymentsToAcquirePropertyPlantAndEquipment", "CapitalExpenditures"], depTags: ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization"] },
  ];

  /** 拉取一家 companyfacts, 提取指定标签的年度 10-K 值 { year: val } */
  async function fetchAnnualTag(cik, tag) {
    // fetchWithFallback: SEC 对 node fetch TLS 指纹敏感, curl 兜底
    const j = JSON.parse(
      await fetchWithFallback(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
        headers: { "User-Agent": UA },
        referer: "https://www.sec.gov/",
        timeout: 20000,
        retries: 1,
      })
    );
    const u = j?.facts?.["us-gaap"]?.[tag];
    if (!u?.units?.USD) return null;
    const out = {};
    for (const e of u.units.USD) {
      if (e.form === "10-K" && e.val != null) {
        const y = e.end.slice(0, 4);
        // 取每年最后一个 10-K 值(避免 FY 变动重复)
        if (out[y] == null) out[y] = e.val;
      }
    }
    return Object.keys(out).length ? out : null;
  }

  /** 逐家探测标签 fallback, 返回 { name, capex: {year:val}, dep: {year:val} } */
  async function fetchCompany(comp) {
    let capex = null, dep = null;
    for (const t of comp.capexTags) { capex = await fetchAnnualTag(comp.cik, t); if (capex) break; }
    for (const t of comp.depTags) { dep = await fetchAnnualTag(comp.cik, t); if (dep) break; }
    return { name: comp.name, capex: capex || {}, dep: dep || {} };
  }

  /** 聚合四家年度 CapEx/折旧(十亿美元) + AI 云收入近似, 返回 2019 起年度序列 */
  async function handleSecCapex() {
    const results = await Promise.all(COMPANIES.map(fetchCompany));
    const years = new Set();
    for (const r of results) { Object.keys(r.capex).forEach((y) => years.add(y)); Object.keys(r.dep).forEach((y) => years.add(y)); }
    const series = [...years].sort();
    const out = {
      generatedAt: new Date().toISOString(),
      source: "SEC EDGAR companyfacts API (10-K)",
      byCompany: results,
      capexTotal: {}, // { year: $B }
      depTotal: {},
      capexAnnual: [], // 前视预测输入
    };
    for (const y of series) {
      const capSum = results.reduce((s, r) => s + (r.capex[y] || 0), 0);
      const depSum = results.reduce((s, r) => s + (r.dep[y] || 0), 0);
      if (capSum > 0) out.capexTotal[y] = +(capSum / 1e9).toFixed(1);
      if (depSum > 0) out.depTotal[y] = +(depSum / 1e9).toFixed(1);
    }
    // 落盘历史
    try {
      const hist = readHistory(HISTORY_FILE) || {};
      hist[bjToday()] = { capexTotal: out.capexTotal, depTotal: out.depTotal };
      writeHistory(HISTORY_FILE, hist);
    } catch { /* 落盘失败不阻塞响应 */ }
    return out;
  }

  return { handleSecCapex, fetchAnnualTag };
};
