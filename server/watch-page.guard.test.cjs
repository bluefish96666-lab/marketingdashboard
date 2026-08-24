// /watch 页源码守卫: 必须挂路由, 且不得引入驾驶舱组件
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const watchSrc = fs.readFileSync(path.join(root, "src/WatchDashboard.tsx"), "utf8");
const appSrc = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");

const COCKPIT = [
  "SectorPanel", "NewsPanel", "TreasuryPanel", "CommodityPanel", "TickerTape",
  "OpenRouterPanel", "ChainPanel", "RankPanel", "MoneyFlowPanel", "BoardFlowPanel",
  "IndexPanel", "GoldDashboard",
];

test("App 挂载 /watch", () => {
  assert.match(appSrc, /path="\/watch"/);
  assert.match(appSrc, /WatchDashboard/);
});

test("WatchDashboard 不 import 驾驶舱组件, 无买卖", () => {
  const imports = watchSrc.split("\n").filter((l) => l.startsWith("import ")).join("\n");
  for (const name of COCKPIT) {
    assert.doesNotMatch(imports, new RegExp(`\\b${name}\\b`), name);
  }
  assert.doesNotMatch(watchSrc, /买入|卖出|目标价/);
});
