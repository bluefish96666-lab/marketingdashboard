// 通用网络/数据工具 — 零依赖
"use strict";

// CSV 参数解析: "a, b,,c " → ["a","b","c"] (去空白, 过滤空项)
const parseCsvParam = (str) => String(str || "").split(",").map((s) => s.trim()).filter(Boolean);

// 数组分块: chunked([1..10], 3) → [[1,2,3],[4,5,6],[7,8,9],[10]]
const chunked = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// 无原型对象: 上游/用户可控字符串作 key 时防 __proto__ 原型污染
const safeRecord = () => Object.create(null);

module.exports = { parseCsvParam, chunked, safeRecord };
