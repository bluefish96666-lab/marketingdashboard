// AI 数据源 — 问财智能选股
"use strict";

module.exports = function createAi(ctx) {
  const crypto = require("crypto");

  function pickValue(obj, matchers) {
    for (const [key, value] of Object.entries(obj || {})) {
      if (matchers.some((m) => key.includes(m))) return value;
    }
    return undefined;
  }

  function pickRatioValue(obj) {
    for (const [key, value] of Object.entries(obj || {})) {
      if ((key.includes("/") || key.includes("除以")) && (key.includes("成交额") || key.includes("成交金额"))) return value;
    }
    return pickValue(obj, ["放量倍数", "成交额放量", "成交金额放量"]);
  }

  function parseMaybeNumber(v) {
    if (v == null || v === "") return undefined;
    const n = parseFloat(String(v).replace(/,/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }

  function iwencaiErrorFromText(text) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (clean.includes("次数已用完")) return "IWENCAI_QUOTA_EXHAUSTED: 问财今日次数已用完";
    if (clean.includes("Invalid") || clean.includes("Unauthorized") || clean.includes("鉴权") || clean.includes("权限")) {
      return "IWENCAI_AUTH_FAILED: 问财鉴权失败";
    }
    // 上游原文只记服务端日志, 不回显给客户端
    console.error("[iwencai] non-json response:", clean.slice(0, 160));
    return "IWENCAI_NON_JSON: 问财返回非JSON响应";
  }

  // 问财返回的列名带查询时日期区间(如 平均成交额[20260715-20260717]), 日期随查询变化, 硬编码会失效
  // 按基础列名 + 日期跨度匹配(targetDays 为目标自然日数), 无日期的纯 key 作为兜底
  function pickDatedValue(obj, baseNames, targetDays, fallbacks = []) {
    let best;
    let bestDiff = Infinity;
    let plain;
    const day = (s) => Date.parse(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
    for (const [key, value] of Object.entries(obj || {})) {
      const m = key.match(/^(.+?)\[(\d{8})-(\d{8})\]/);
      if (m && baseNames.includes(m[1])) {
        const span = (day(m[3]) - day(m[2])) / 86400000 + 1;
        const diff = Math.abs(span - targetDays);
        if (diff < bestDiff) { bestDiff = diff; best = value; }
      } else if (!m && fallbacks.some((f) => key.includes(f))) {
        plain = value;
      }
    }
    return best !== undefined ? best : plain;
  }

  function normalizeIwencaiStock(item) {
    return {
      code: String(item["股票代码"] || item.code || ""),
      name: String(item["股票简称"] || item.name || ""),
      price: parseMaybeNumber(item["最新价"] ?? item.price),
      pct: parseMaybeNumber(item["最新涨跌幅"] ?? pickValue(item, ["涨跌幅"]) ?? item.pct),
      ratio: parseMaybeNumber(pickRatioValue(item)),
      avgAmount3: parseMaybeNumber(pickDatedValue(item, ["平均成交额", "区间日均成交额", "最近3日区间日均成交额"], 3, ["最近3日区间日均成交额", "最近3日平均成交金额", "成交额平均值"])),
      avgAmount20: parseMaybeNumber(pickDatedValue(item, ["平均成交额", "区间日均成交额", "前20日区间日均成交额"], 28, ["前20日区间日均成交额", "前20日平均成交金额"])),
      rangePct5: parseMaybeNumber(pickDatedValue(item, ["涨跌幅"], 5, ["最近5日区间涨跌幅"])),
      raw: item,
    };
  }

  async function handleMysterySelect(query, limit = "30", page = "1") {
    const apiKey = process.env.IWENCAI_API_KEY;
    // err.status 供路由层回显安全文案(见路由错误处理)
    if (!apiKey) { const e = new Error("问财未配置 API Key(请在 server/.env 配置 IWENCAI_API_KEY)"); e.status = 500; throw e; }
    const base = (process.env.IWENCAI_BASE_URL || "https://openapi.iwencai.com").replace(/\/$/, "");
    const traceId = crypto.randomBytes(32).toString("hex");
    const payload = {
      query,
      page: String(parseInt(page, 10) || 1),
      limit: String(Math.min(Math.max(parseInt(limit, 10) || 30, 1), 80)),
      is_cache: "1",
      expand_index: "true",
    };
    const resp = await fetch(`${base}/v1/query2data`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Claw-Call-Type": "normal",
        "X-Claw-Skill-Id": "hithink-astock-selector",
        "X-Claw-Skill-Version": "1.0.0",
        "X-Claw-Plugin-Id": "none",
        "X-Claw-Plugin-Version": "none",
        "X-Claw-Trace-Id": traceId,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000), // 与其他上游一致, 防止无限挂起
    });
    const text = await resp.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(iwencaiErrorFromText(text));
    }
    if (!resp.ok) {
      const errMsg = typeof json?.error === "string" ? json.error : json?.error?.message || json?.message || `IWENCAI_HTTP_${resp.status}`;
      throw new Error(errMsg);
    }
    const datas = Array.isArray(json.datas) ? json.datas : Array.isArray(json.data) ? json.data : [];
    return {
      query,
      total: Number(json.code_count || datas.length || 0),
      rows: datas.map(normalizeIwencaiStock),
      chunksInfo: json.chunks_info,
    };
  }

  return { handleMysterySelect };
};
