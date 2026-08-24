"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const FORBIDDEN = [/theBigGavin/i, /hermes\.cc\.cd/i];
const PRO_HREF = /href\s*=\s*["'][^"']*\/pro(?:["'/?#]|$)/i;
const PRO_ROUTE = /\b(?:to|path)\s*=\s*["']\/pro["']|\bto:\s*["']\/pro["']/;

function walkUi(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules") continue;
      walkUi(p, acc);
    } else if (/\.(tsx|ts|html|css)$/.test(ent.name) && !ent.name.includes(".test.")) {
      acc.push(p);
    }
  }
  return acc;
}

test("src UI 与 index.html 无 theBigGavin / hermes.cc.cd / /pro href", () => {
  const files = walkUi(path.join(root, "src"));
  files.push(path.join(root, "index.html"));
  const hits = [];
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    for (const re of [...FORBIDDEN, PRO_HREF, PRO_ROUTE]) {
      if (re.test(text)) hits.push(`${path.relative(root, f)}: ${re}`);
    }
  }
  assert.deepEqual(hits, []);
});
