// 腾讯行情 URL 模板单点定义(前端侧)
// 服务端对应单点: server/lib/tencent-urls.cjs — 修改本文件时需同步另一端
// 调用方一律经这里拼 URL, 禁止手写 qt.gtimg.cn / ifzq.gtimg.cn 主机名

/** 腾讯批量报价: q=code1,code2,...(codes 未经编码, 与既有浏览器直连行为一致) */
export function quoteUrl(codes: string[]): string {
  return `https://qt.gtimg.cn/q=${codes.join(",")}`;
}

/** 腾讯个股/指数分时线(沪深) */
export function tencentMinuteUrl(code: string): string {
  return `https://ifzq.gtimg.cn/appstock/app/minute/query?code=${code}`;
}

/** 腾讯板块/概念榜(t=01 行业 / t=02 概念) */
export function tencentRankUrl(n: number, type: string, dir: number): string {
  return `https://ifzq.gtimg.cn/appstock/app/mktHs/rank?l=${n}&p=1&t=${type}/averatio&o=${dir}`;
}
