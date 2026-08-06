// FRED 半导体 PPI — 硬件/内存通胀修正因子
// 序列 PCU334413334413: 半导体及相关元件制造工业 PPI
// PPI YoY 掉头向下 = 供应链成本缓解信号(加速 token 成本下降)
"use strict";

module.exports = function createFredPpi(ctx) {
  const { fetchText } = ctx;

  /** 拉取 PPI 序列, 返回 { latest, yoy12m, trend } trend: "falling"|"rising"|"flat" */
  async function handleFredPpi() {
    const csv = await fetchText("https://fred.stlouisfed.org/graph/fredgraph.csv?id=PCU334413334413");
    const rows = [];
    for (const line of csv.split("\n").slice(1)) {
      const [date, val] = line.split(",");
      const v = parseFloat(val);
      if (date && Number.isFinite(v)) rows.push({ date, v });
    }
    if (rows.length < 13) { const e = new Error("FRED PPI 数据不足"); e.status = 502; throw e; }
    const last = rows[rows.length - 1];
    const yoy = rows[rows.length - 13];
    const prev = rows[rows.length - 25]; // 前一个 12 月窗口
    const yoy12m = +(((last.v - yoy.v) / yoy.v) * 100).toFixed(2);
    const prevYoy = prev ? +(((yoy.v - prev.v) / prev.v) * 100).toFixed(2) : null;
    const trend = prevYoy == null ? "flat" : yoy12m < prevYoy ? "falling" : yoy12m > prevYoy ? "rising" : "flat";
    return {
      generatedAt: new Date().toISOString(),
      source: "FRED PCU334413334413",
      latest: { date: last.date, value: last.v },
      yoy12m,
      prevYoy,
      trend,
    };
  }

  return { handleFredPpi };
};
