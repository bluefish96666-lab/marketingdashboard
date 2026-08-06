// 本地 JSON 持久化 — 读/写历史文件
"use strict";
const fs = require("fs");
const path = require("path");

const bjToday = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

// 读取历史 JSON, 缺失/损坏返回 {}
function readHistory(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf-8") || "{}"); }
  catch { return {}; }
}

// 异步写历史 JSON(自动建目录); 失败仅记日志不抛
async function writeHistory(file, history, label = "") {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, JSON.stringify(history));
  } catch (e) { console.error(`[persist] ${label} write error:`, e?.message || e); }
}

module.exports = { bjToday, readHistory, writeHistory };
