import { describe, expect, it } from "vitest";
import { DEFAULT_WATCHLIST, sanitizeWatchlist } from "./watchlist";

describe("sanitizeWatchlist", () => {
  it("丢弃非法项、去重, 不补造代码", () => {
    expect(sanitizeWatchlist(["sh600519", "sh600519", "nf_AU0", "usAAPL", ""])).toEqual([
      "sh600519",
      "usAAPL",
    ]);
  });

  it("非数组返回 null(调用方回落到默认列表)", () => {
    expect(sanitizeWatchlist(null)).toBeNull();
    expect(sanitizeWatchlist("sh600519")).toBeNull();
    expect(DEFAULT_WATCHLIST.length).toBeGreaterThan(0);
  });
});
