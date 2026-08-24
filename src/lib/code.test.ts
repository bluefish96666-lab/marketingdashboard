import { describe, expect, it } from "vitest";
import {
  isWatchableTicker,
  normalizeStockCode,
  normalizeWatchTicker,
  watchMarketLabel,
} from "./code";

describe("normalizeStockCode (A 股契约不变)", () => {
  it("补全沪深北前缀", () => {
    expect(normalizeStockCode("600519")).toBe("sh600519");
    expect(normalizeStockCode("000001")).toBe("sz000001");
    expect(normalizeStockCode("300750")).toBe("sz300750");
    expect(normalizeStockCode("830799")).toBe("nq830799");
    expect(normalizeStockCode("430047")).toBe("bj430047");
  });

  it("不把字母代码收成美股(财报等调用方)", () => {
    expect(normalizeStockCode("AAPL")).toBe("aapl");
    expect(normalizeStockCode("hk00700")).toBe("hk00700");
  });
});

describe("normalizeWatchTicker", () => {
  it("A 股与 normalizeStockCode 一致", () => {
    expect(normalizeWatchTicker("600519")).toBe("sh600519");
    expect(normalizeWatchTicker("sh600519")).toBe("sh600519");
    expect(normalizeWatchTicker("002475")).toBe("sz002475");
  });

  it("港股补全为 hk + 5 位", () => {
    expect(normalizeWatchTicker("hk00700")).toBe("hk00700");
    expect(normalizeWatchTicker("HK700")).toBe("hk00700");
    expect(normalizeWatchTicker("00700.hk")).toBe("hk00700");
    expect(normalizeWatchTicker("700")).toBe("hk00700");
  });

  it("美股归一为 us + 大写代码", () => {
    expect(normalizeWatchTicker("usAAPL")).toBe("usAAPL");
    expect(normalizeWatchTicker("AAPL")).toBe("usAAPL");
    expect(normalizeWatchTicker("aapl.us")).toBe("usAAPL");
    expect(normalizeWatchTicker("gb_aapl")).toBe("usAAPL");
    expect(normalizeWatchTicker("BRK.B")).toBe("usBRK.B");
  });
});

describe("isWatchableTicker / watchMarketLabel", () => {
  it("只接受腾讯报价中心个股代码", () => {
    expect(isWatchableTicker("sh600519")).toBe(true);
    expect(isWatchableTicker("hk00700")).toBe(true);
    expect(isWatchableTicker("usAAPL")).toBe(true);
    expect(isWatchableTicker("nf_AU0")).toBe(false);
    expect(isWatchableTicker("BTCUSDT")).toBe(false);
    expect(isWatchableTicker("aapl")).toBe(false);
  });

  it("市场标签", () => {
    expect(watchMarketLabel("sz002475")).toBe("A");
    expect(watchMarketLabel("hk00700")).toBe("港");
    expect(watchMarketLabel("usAAPL")).toBe("美");
  });
});
