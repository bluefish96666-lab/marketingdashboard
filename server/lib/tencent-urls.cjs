// 腾讯行情 URL 模板单点定义(服务端侧)
// 前端对应单点: src/lib/tencent-urls.ts — 修改本文件时需同步另一端
// 调用方一律经这里拼 URL, 禁止手写 qt.gtimg.cn / ifzq.gtimg.cn 主机名
"use strict";

/** 腾讯批量报价: q=<已编码查询串>(参数由调用方按上游要求编码, 勿在此重复编码) */
function quoteUrl(q) {
  return `https://qt.gtimg.cn/q=${q}`;
}

/** 腾讯个股/指数分时线(沪深) */
function tencentMinuteUrl(code) {
  return `https://ifzq.gtimg.cn/appstock/app/minute/query?code=${encodeURIComponent(code)}`;
}

/** 腾讯美股分时线(us* 只有 usMinute 接口返回全日序列) */
function usMinuteUrl(code) {
  return `https://web.ifzq.gtimg.cn/appstock/app/usMinute/query?code=${encodeURIComponent(code)}`;
}

/** 腾讯板块/概念榜(t=01 行业 / t=02 概念) */
function tencentRankUrl(n, type, dir) {
  return `https://ifzq.gtimg.cn/appstock/app/mktHs/rank?l=${encodeURIComponent(n)}&p=1&t=${encodeURIComponent(type)}/averatio&o=${encodeURIComponent(dir)}`;
}

module.exports = { quoteUrl, tencentMinuteUrl, usMinuteUrl, tencentRankUrl };
