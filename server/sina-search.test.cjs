// 新浪建议码 → 腾讯报价代码(港/美) — node:test
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const createSina = require("./sources/sina.cjs");

function makeSina(suggestvalue) {
  return createSina({
    fetchText: async () => { throw new Error("unused"); },
    fetchTextAny: async () => `var suggestvalue="${suggestvalue}";`,
    fetchSinaJson: async () => { throw new Error("skip eastmoney"); },
    num: Number,
    toMarketCode6: (c) => c,
    cache: new Map(),
    cacheSet: () => {},
    cached: async (_k, _t, fn) => fn(),
    entry: (d) => d,
    failEntry: (d) => d,
    quoteBackoff: () => 0,
    TTLS: {},
  });
}

test("sinaFullToQuoteCode: 沪深 / 港股 / 美股(含 gb_)", () => {
  const { sinaFullToQuoteCode } = makeSina("");
  assert.equal(sinaFullToQuoteCode("sh600519"), "sh600519");
  assert.equal(sinaFullToQuoteCode("hk00700"), "hk00700");
  assert.equal(sinaFullToQuoteCode("hk700"), "hk00700");
  assert.equal(sinaFullToQuoteCode("usAAPL"), "usAAPL");
  assert.equal(sinaFullToQuoteCode("gb_aapl"), "usAAPL");
  assert.equal(sinaFullToQuoteCode("nf_AU0"), "");
});

test("handleStockSearch 从新浪建议解析港美代码", async () => {
  const { handleStockSearch } = makeSina(
    "贵州茅台,11,600519,sh600519,gzmt;腾讯控股,31,00700,hk00700,txkg;苹果,41,AAPL,gb_aapl,pg"
  );
  const rows = await handleStockSearch("腾讯");
  assert.deepEqual(rows.map((r) => r.code), ["sh600519", "hk00700", "usAAPL"]);
});
