import { describe, expect, it } from "vitest";
import { applyRemoveRecent, resolveFinLookup } from "./company-select";
import type { FinCompany } from "./FinContext";

const MAOTAI = { code: "sh600519", name: "贵州茅台" };
const PINGAN = { code: "sz000001", name: "平安银行" };
const WULIANG = { code: "sz000858", name: "五粮液" };

describe("resolveFinLookup (查 / Enter 共用)", () => {
  it("输入 6 位代码时 Enter/查 直接选中(无需下拉)", () => {
    expect(resolveFinLookup("600519", [], -1)).toEqual({ code: "sh600519", name: "600519" });
    expect(resolveFinLookup("sh600519", [], -1)).toEqual({ code: "sh600519", name: "sh600519" });
  });

  it("名称检索走下拉: 无候选则不猜测", () => {
    expect(resolveFinLookup("茅台", [], -1)).toBeNull();
  });

  it("名称有下拉时 Enter/查 取首条", () => {
    expect(resolveFinLookup("茅台", [MAOTAI, WULIANG], -1)).toEqual(MAOTAI);
  });

  it("名称有下拉且高亮时 Enter/查 取高亮条", () => {
    expect(resolveFinLookup("茅台", [MAOTAI, WULIANG], 1)).toEqual(WULIANG);
  });

  it("空输入不选中", () => {
    expect(resolveFinLookup("  ", [], -1)).toBeNull();
  });
});

describe("applyRemoveRecent (chip ×)", () => {
  const recent: FinCompany[] = [MAOTAI, PINGAN, WULIANG];

  it("删当前且后面还有 → 切到下一条", () => {
    expect(applyRemoveRecent(recent, MAOTAI, "sh600519")).toEqual({
      recent: [PINGAN, WULIANG],
      company: PINGAN,
    });
  });

  it("删当前中间项 → 切到原位置之后的那只", () => {
    expect(applyRemoveRecent(recent, PINGAN, "sz000001")).toEqual({
      recent: [MAOTAI, WULIANG],
      company: WULIANG,
    });
  });

  it("删当前末条 → 切到新的末条(原上一条)", () => {
    expect(applyRemoveRecent(recent, WULIANG, "sz000858")).toEqual({
      recent: [MAOTAI, PINGAN],
      company: PINGAN,
    });
  });

  it("删非当前 chip 时公司不变", () => {
    expect(applyRemoveRecent(recent, MAOTAI, "sz000001")).toEqual({
      recent: [MAOTAI, WULIANG],
      company: MAOTAI,
    });
  });

  it("删掉唯一 chip 后公司保持(列表变空)", () => {
    expect(applyRemoveRecent([MAOTAI], MAOTAI, "sh600519")).toEqual({
      recent: [],
      company: MAOTAI,
    });
  });
});
