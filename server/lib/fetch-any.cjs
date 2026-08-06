// 统一上游数据通道 — fetch/curl 双通道 + 重试 + 节流 + 状态码校验
// 收敛 index.cjs / eastmoney.cjs / futures.cjs 中 5 份重复的 fetch→curl 兜底模板
"use strict";

const iconv = require("iconv-lite");
const { execFile } = require("child_process");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = function createFetchAny({ onUpstream } = {}) {
  const count = () => { if (onUpstream) onUpstream(); };

  /** curl 通道: TLS 指纹敏感 / 被 node fetch 拦截的上游兜底。
      -f: 4xx/5xx 以非零码退出并携带 stderr 详情(使 5xx 也落入上层退避/负缓存路径) */
  function curlText(url, { referer, timeout = 8000, encoding = "gbk", headers } = {}) {
    count(); // 上游调用计数(fetchText/curlText 是所有上游 fetch 的唯一出口)
    return new Promise((resolve, reject) => {
      // -sS: 静默进度但保留错误信息到 stderr, 失败原因可诊断(28=超时, 35=TLS握手, 6=DNS...)
      const args = ["-sS", "-f", "--max-time", String(Math.ceil(timeout / 1000)), "-H", `User-Agent: ${UA}`];
      if (referer) args.push("-H", `Referer: ${referer}`);
      for (const [k, v] of Object.entries(headers || {})) args.push("-H", `${k}: ${v}`);
      args.push(url);
      execFile("curl", args, { maxBuffer: 4 * 1024 * 1024, encoding: "buffer" }, (err, stdout, stderr) => {
        if (err) {
          const detail = stderr && stderr.length ? String(stderr).trim().slice(0, 200) : err.message;
          return reject(new Error(`curl(${err.code ?? "?"}) ${url} -> ${detail}`));
        }
        resolve(iconv.decode(stdout, encoding));
      });
    });
  }

  /** fetch 通道: 带 UA / 超时 / 编码解码。
      resp.ok 校验 — 非 2xx 一律抛错, 使文本端点 5xx 也落入上层退避/负缓存路径 */
  async function fetchText(url, { referer, gbk = false, timeout = 8000, headers } = {}) {
    count();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const h = { "User-Agent": UA, Accept: "*/*", ...headers };
      if (referer) h["Referer"] = referer;
      const resp = await fetch(url, { headers: h, signal: ctrl.signal });
      if (!resp.ok) throw new Error(`upstream http ${resp.status} ${url}`);
      const buf = Buffer.from(await resp.arrayBuffer());
      return gbk ? iconv.decode(buf, "gbk") : buf.toString("utf-8");
    } finally {
      clearTimeout(timer);
    }
  }

  /** 参数化双通道: 每轮按 hosts 换主机 × fetch→curl, retries 为额外轮数。
      decode: "utf-8" | "gbk"(覆盖 gbk 标志); throttle: 成功节流 { ok } / 失败间隔 { err };
      accept(text): 仅通过校验的响应才算成功(处理"HTTP 成功但内容为空"的翻页校验) */
  async function fetchWithFallback(url, {
    referer, gbk = false, timeout = 8000, headers,
    retries = 0, hosts = [], decode, throttle = 0, accept,
  } = {}) {
    const enc = decode || (gbk ? "gbk" : "utf-8");
    const th = typeof throttle === "number" ? { ok: throttle, err: throttle } : throttle || {};
    const roundUrls = [
      url,
      ...hosts.map((h) => { const u = new URL(url); u.host = h; return u.href; }),
    ];
    let lastErr = new Error("upstream unreachable");
    for (let round = 0; round <= Math.max(0, retries); round++) {
      for (const u of roundUrls) {
        for (const via of ["fetch", "curl"]) {
          try {
            const text = via === "fetch"
              ? await fetchText(u, { referer, gbk: enc === "gbk", timeout, headers })
              : await curlText(u, { referer, timeout, encoding: enc, headers });
            if (accept && !accept(text)) throw new Error("empty upstream response");
            if (th.ok) await sleep(th.ok); // 成功节流(东财 WAF)
            return text;
          } catch (e) {
            lastErr = e;
            if (th.err) await sleep(th.err); // 失败间隔
          }
        }
      }
    }
    throw lastErr;
  }

  // 单通道语义的 fetch → curl 兜底(fetchTextAny 历史命名, 无 hosts/重试/节流)
  const fetchTextAny = (url, opts) => fetchWithFallback(url, opts);

  return { fetchText, curlText, fetchTextAny, fetchWithFallback, UA };
};
