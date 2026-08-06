// 腾讯板块榜代理接口 getBoardRankList — URL 构造/拉取/解析/估算成交额
// tencent.cjs(板块成分股) 与 eastmoney.cjs(盘后榜单兜底) 共用, 消除两份重复实现
"use strict";

module.exports = function createQqRank(ctx) {
  const { fetchText, num } = ctx;

  const rankUrl = (boardCode, sortType, direct, offset, count) =>
    `https://proxy.finance.qq.com/cgi/cgi-bin/rank/hs/getBoardRankList` +
    `?board_code=${encodeURIComponent(boardCode)}&sort_type=${encodeURIComponent(sortType)}` +
    `&direct=${encodeURIComponent(direct)}&offset=${offset}&count=${count}`;

  /** 拉取一页榜单(上游 rank_list 数组); 上游失败抛错, 由路由层退避/负缓存处理 */
  async function getBoardRankList({ boardCode, sortType, direct, offset = 0, count = 100 }) {
    const text = await fetchText(rankUrl(boardCode, sortType, direct, offset, count));
    return JSON.parse(text)?.data?.rank_list || [];
  }

  /** 估算成交额: 成交量(手) × 100 × 现价 = 元(腾讯 rank 接口不含成交额字段) */
  const estAmount = (s) => num(s.volume) * 100 * num(s.zxj);

  return { getBoardRankList, estAmount };
};
