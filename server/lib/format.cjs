// 数值/格式化工具 — 零依赖, 供 index.cjs 及上游适配器复用
"use strict";

// 解析数值: 非法输入静默返回 0(兼容历史行为; 调用方如需区分"缺失"应自行判断)
const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

// 涨跌额: (price - prev), 保留 4 位小数
const changeOf = (price, prev) => +(price - prev).toFixed(4);

// 涨跌幅: (price-prev)/prev*100, 保留 3 位小数; prev 为空返回 0
const pctOf = (price, prev) => (prev ? +(((price - prev) / prev) * 100).toFixed(3) : 0);

// Date → "HHMM" 字符串
const fmtHHMM = (d) => `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;

// 统一的市场前缀映射(镜像前端 src/lib/code.ts toMarketCode): 6→sh, 0/3→sz, 4/8/9→bj
const toMarketCode6 = (code6) => {
  if (/^6/.test(code6)) return `sh${code6}`;
  if (/^[03]/.test(code6)) return `sz${code6}`;
  if (/^[489]/.test(code6)) return `bj${code6}`;
  return code6;
};

module.exports = { num, changeOf, pctOf, fmtHHMM, toMarketCode6 };
