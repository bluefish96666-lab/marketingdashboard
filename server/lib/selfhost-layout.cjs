/**
 * 自部署(SELFHOST=1)布局同步 — 单实例单用户，跨设备同步 GMT 布局 / 面板缩放 / 自选股等偏好。
 *
 * 契约与托管版 /api/hosting/layout 同形，前端 layout-sync 只认这一种形状：
 *   GET  /api/selfhost/layout            → { layout: { [key]: any } }
 *   POST /api/selfhost/layout {layout}   → 按顶层 key merge（传 null 删除该 key），返回完整对象
 *
 * 认证：请求头 X-Sync-Key 必须等于 server/.env 的 SELFHOST_SYNC_KEY；未配置密钥时端点不挂载(404)，
 * 前端自动退回 localStorage。不做账号系统 —— 那是托管版(mrd-pro 私有仓)的职责。
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MAX_BYTES = 200 * 1024; // 单文件上限，防止把整个 store 写爆

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function createSelfhostLayout({ file, getKey }) {
  let store = null;

  function load() {
    if (store) return store;
    try {
      const j = JSON.parse(fs.readFileSync(file, "utf-8") || "{}");
      store = j && typeof j === "object" && !Array.isArray(j) ? j : {};
    } catch {
      store = {};
    }
    return store;
  }

  // 原子写：先写临时文件再 rename，进程被杀不留半截 JSON
  async function persist() {
    const json = JSON.stringify(store);
    if (Buffer.byteLength(json) > MAX_BYTES) throw httpError(413, "layout too large");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.promises.writeFile(tmp, json);
    await fs.promises.rename(tmp, file);
  }

  function auth(req) {
    const key = getKey();
    if (!key) throw httpError(404, "not found");
    const given = req.headers["x-sync-key"];
    if (!given || !safeEqual(given, key)) throw httpError(401, "unauthorized");
  }

  const routes = {
    "/api/selfhost/layout": async (_q, body, req) => {
      auth(req);
      const cur = load();
      if (req.method === "GET") return { layout: cur };
      if (req.method !== "POST") throw httpError(405, "method not allowed");
      const patch = body && typeof body.layout === "object" && body.layout !== null && !Array.isArray(body.layout) ? body.layout : null;
      if (!patch) throw httpError(400, "layout object required");
      for (const [k, v] of Object.entries(patch)) {
        if (typeof k !== "string" || k.length > 64) throw httpError(400, "bad key");
        if (v === null) delete cur[k];
        else cur[k] = v;
      }
      await persist();
      return { layout: cur };
    },
  };

  return { routes };
}

module.exports = { createSelfhostLayout };
