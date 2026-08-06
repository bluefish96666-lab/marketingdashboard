// 内存缓存 — 有界 LRU 风格 Map + 定时清扫 + 失败退避
"use strict";

const CACHE_MAX = 2000;

// 失败退避: 连续失败次数 → 退避毫秒(指数增长, 上限 5 分钟)
const backoffOf = (n) => Math.min(300000, 1000 * 2 ** (n || 0));

function createCache() {
  const cache = new Map(); // key -> { ts, data, inflight, ttl, failAt, failCount }

  function sweep() {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.inflight) continue;
      const inBackoff = v.failAt != null && now - v.failAt < backoffOf(v.failCount);
      if (v.data === undefined || (now - v.ts > (v.ttl || 60000) && !inBackoff)) cache.delete(k);
    }
  }

  // 写缓存: 超限先清过期项, 仍超则按 Map 插入序淘汰最旧条目
  function set(key, entry) {
    if (cache.has(key)) cache.delete(key); // 重插以刷新插入序
    cache.set(key, entry);
    if (cache.size <= CACHE_MAX) return;
    sweep();
    while (cache.size > CACHE_MAX) {
      let oldest;
      for (const [k, v] of cache) {
        if (!v.inflight) { oldest = k; break; }
      }
      if (oldest === undefined) break; // 全部在途, 不再淘汰
      cache.delete(oldest);
    }
  }

  const sweeper = setInterval(sweep, 60000);
  sweeper.unref();

  return { cache, set, sweep, backoffOf };
}

module.exports = { createCache, backoffOf, CACHE_MAX };
