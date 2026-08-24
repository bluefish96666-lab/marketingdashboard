import { afterEach, describe, expect, it, vi } from "vitest";
import { isWatchableTicker } from "./code";
import {
  DEFAULT_WATCHLIST,
  LEGACY_DEFAULT_WATCHLIST,
  WATCHLIST_LS_KEY,
  loadWatchlist,
  resolveStoredWatchlist,
  sanitizeWatchlist,
} from "./watchlist";

const STRENGTH_12 = [
  "sh601288",
  "sh600900",
  "sh601899",
  "sz001309",
  "sh688825",
  "sz300951",
  "sh600105",
  "sz002916",
  "sh601138",
  "sh688008",
  "sz002484",
  "sz002281",
];

describe("DEFAULT_WATCHLIST", () => {
  it("是 2026-08-24 强度榜 12 只且顺序固定", () => {
    expect(DEFAULT_WATCHLIST).toEqual(STRENGTH_12);
    expect(DEFAULT_WATCHLIST.every(isWatchableTicker)).toBe(true);
    expect(new Set(DEFAULT_WATCHLIST).size).toBe(12);
  });
});

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
  });
});

describe("resolveStoredWatchlist", () => {
  it("无存储时用新默认 12 只", () => {
    expect(resolveStoredWatchlist(null)).toEqual(STRENGTH_12);
  });

  it("旧 4 只默认精确匹配则迁移到 12", () => {
    expect(resolveStoredWatchlist(["sh688126", "sz002463", "sh600096", "sz002475"])).toEqual(STRENGTH_12);
    expect(resolveStoredWatchlist([...LEGACY_DEFAULT_WATCHLIST])).toEqual(DEFAULT_WATCHLIST);
  });

  it("用户改过的列表原样保留", () => {
    const custom = ["sh600519", "sz000001"];
    expect(resolveStoredWatchlist(custom)).toEqual(custom);
  });

  it("旧 4 只顺序不同视为用户列表, 不迁移", () => {
    const shuffled = [...LEGACY_DEFAULT_WATCHLIST].reverse();
    expect(resolveStoredWatchlist(shuffled)).toEqual(shuffled);
  });

  it("用户清空后的空列表不回填默认", () => {
    expect(resolveStoredWatchlist([])).toEqual([]);
  });
});

describe("loadWatchlist", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockStorage(initial?: Record<string, string>) {
    const map = new Map<string, string>(Object.entries(initial ?? {}));
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => {
          map.set(k, v);
        },
        removeItem: (k: string) => {
          map.delete(k);
        },
      },
    });
    return map;
  }

  it("旧 4 只默认写入存储后会迁到 12 并回写", () => {
    const map = mockStorage({ [WATCHLIST_LS_KEY]: JSON.stringify(LEGACY_DEFAULT_WATCHLIST) });
    expect(loadWatchlist()).toEqual(STRENGTH_12);
    expect(JSON.parse(map.get(WATCHLIST_LS_KEY) ?? "null")).toEqual(STRENGTH_12);
  });

  it("自定义列表不改写存储", () => {
    const custom = ["sh600519", "sz300750"];
    const map = mockStorage({ [WATCHLIST_LS_KEY]: JSON.stringify(custom) });
    expect(loadWatchlist()).toEqual(custom);
    expect(JSON.parse(map.get(WATCHLIST_LS_KEY) ?? "null")).toEqual(custom);
  });
});
