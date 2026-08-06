// peer-math 纯函数单测: 均值/排名/usePrev 降级/prevPeriodFn 边界/雷达归一化
import { describe, expect, it } from "vitest";
import type { FinanceBoard, FinanceMain, FinBoardStock } from "@/lib/api";
import { computePeerComparison, prevPeriodFn } from "./peer-math";

const stock = (code: string, name: string, industry: string, over: Partial<FinBoardStock> = {}): FinBoardStock => ({
  code, name, industry, netProfit: 100, profitYoY: 10, revenueYoY: 5, roe: 15, eps: 1, ...over,
});

const board = (period: string, stocks: FinBoardStock[]): FinanceBoard => ({
  period, stocks, industries: [], calendar: [],
});

const main = (name: string, industry: string, over: Partial<FinanceMain> = {}): FinanceMain => ({
  name, industry, mainop: [], mainopHistory: [],
  balance: { totalLiabilities: 0, accountsReceivable: 0 },
  cash: { operate: 0, capex: 0, free: 0 },
  reports: [{
    label: "2025-12-31", date: "2025-12-31", revenue: 1000, netProfit: 12, revenueYoY: 5, profitYoY: 4,
    roe: 11, grossMargin: 30, netMargin: 10, debtRatio: 50, roic: 8, eps: 1.2, ocfPerShare: 0.5,
  }],
  ...over,
});

describe("prevPeriodFn", () => {
  it("各季度回退到上一报告期(跨年 Q1 → 上一年 Q4)", () => {
    expect(prevPeriodFn("2025-03-31")).toBe("2024-12-31");
    expect(prevPeriodFn("2025-06-30")).toBe("2025-03-31");
    expect(prevPeriodFn("2025-09-30")).toBe("2025-06-30");
    expect(prevPeriodFn("2025-12-31")).toBe("2025-09-30");
  });

  it("未知后缀回退到 -06-30", () => {
    expect(prevPeriodFn("2025-01-15")).toBe("2025-06-30");
  });
});

describe("computePeerComparison 基础计算", () => {
  it("行业/计数/均值/排名正确(入榜公司按代码匹配)", () => {
    const b = board("2025-12-31", [
      stock("600519", "贵州茅台", "白酒", { netProfit: 85, profitYoY: 6, revenueYoY: 4, roe: 18, eps: 2.5 }),
      stock("600809", "山西汾酒", "白酒", { netProfit: 100 }),
      stock("600702", "舍得酒业", "白酒", { netProfit: 90 }),
      stock("600779", "水井坊", "白酒", { netProfit: 80 }),
      stock("000858", "五粮液", "白酒", { netProfit: 70 }),
      stock("600276", "恒瑞医药", "医药", { netProfit: 60 }),
    ]);
    const r = computePeerComparison(b, null, main("贵州茅台", "白酒"), "sh600519", "贵州茅台");
    expect(r).not.toBeNull();
    expect(r!.industry).toBe("白酒");
    expect(r!.count).toBe(5);
    expect(r!.inBoard).toBe(true);
    expect(r!.usePrev).toBe(false);

    const np = r!.metrics.find((m) => m.key === "np")!;
    expect(np.label).toBe("净利");
    // 均值 = 其余 4 家均值(不含公司自身)
    expect(np.peerAvg).toBe(85);
    // 排名 = 高于公司的家数 + 1
    expect(np.rank).toBe(3);
    // 净利文本值取报表(companyVal), 比较条取入榜快照(barVal) — 两者分离
    expect(np.companyVal).toBe(12);
    expect(np.barVal).toBe(85);
    expect(np.barAvg).toBe(85);

    expect(r!.metrics.map((m) => m.key)).toEqual(["np", "py", "ry", "roe", "eps"]);
    expect(r!.metrics.map((m) => m.label)).toEqual(["净利", "净利增速", "营收增速", "ROE", "EPS"]);
  });

  it("未入榜时按名称匹配; 无匹配名称且无行业时返回空结果", () => {
    const b = board("2025-12-31", [
      stock("600001", "贵州茅台", "白酒", { netProfit: 90 }),
      stock("600002", "山西汾酒", "白酒", { netProfit: 100 }),
    ]);
    const r = computePeerComparison(b, null, main("贵州茅台", "白酒"), "sh999999", "贵州茅台");
    expect(r).not.toBeNull();
    expect(r!.inBoard).toBe(true);
    expect(r!.industry).toBe("白酒");
    expect(r!.count).toBe(2);
    expect(r!.metrics[0].barVal).toBe(90);

    const b2 = board("2025-12-31", [stock("600001", "甲公司", "白酒")]);
    const r2 = computePeerComparison(b2, null, main("乙公司", ""), "sz999999", "乙公司");
    expect(r2).not.toBeNull();
    expect(r2!.industry).toBeNull();
    expect(r2!.count).toBe(0);
    expect(r2!.metrics).toHaveLength(0);
    expect(r2!.radar).toHaveLength(0);
    expect(r2!.inBoard).toBe(false);
  });

  it("无榜单股票或无数报表返回 null", () => {
    expect(computePeerComparison(board("2025-12-31", []), null, main("贵州茅台", "白酒"), "sh600519", "贵州茅台")).toBeNull();
    expect(computePeerComparison(board("2025-12-31", [stock("600519", "贵州茅台", "白酒")]), null, { ...main("贵州茅台", "白酒"), reports: [] }, "sh600519", "贵州茅台")).toBeNull();
  });
});

describe("computePeerComparison usePrev 降级", () => {
  it("当期同行业 <3 家且上期有数据时, 引用上期全市场并禁用排名", () => {
    const cur = board("2025-12-31", [
      stock("600519", "贵州茅台", "白酒", { netProfit: 85 }),
      stock("600809", "山西汾酒", "白酒", { netProfit: 100 }),
    ]);
    const prevB = board("2025-09-30", [
      stock("600519", "贵州茅台", "白酒", { netProfit: 80 }),
      stock("600809", "山西汾酒", "白酒", { netProfit: 90 }),
      stock("600702", "舍得酒业", "白酒", { netProfit: 70 }),
      stock("000858", "五粮液", "白酒", { netProfit: 60 }),
    ]);
    const r = computePeerComparison(cur, prevB, main("贵州茅台", "白酒"), "sh600519", "贵州茅台");
    expect(r).not.toBeNull();
    expect(r!.usePrev).toBe(true);
    expect(r!.count).toBe(4); // 上期 4 家
    expect(r!.metrics[0].peerAvg).toBe(75); // (80+90+70+60)/4
    expect(r!.metrics[0].barVal).toBe(85); // 入榜快照仍取当期
    expect(r!.metrics[0].rank).toBeNull(); // 降级期不排位
  });

  it("上期无数据时不降级, 按当期样本计算", () => {
    const cur = board("2025-12-31", [
      stock("600519", "贵州茅台", "白酒", { netProfit: 85 }),
      stock("600809", "山西汾酒", "白酒", { netProfit: 100 }),
    ]);
    const prevEmpty = board("2025-09-30", []);
    const r = computePeerComparison(cur, prevEmpty, main("贵州茅台", "白酒"), "sh600519", "贵州茅台");
    expect(r).not.toBeNull();
    expect(r!.usePrev).toBe(false);
    expect(r!.count).toBe(2);
    // 同业池含公司自身行: [85, 100] → 均值 92.5, 高于 85 仅 1 家 → 第 2
    expect(r!.metrics[0].rank).toBe(2);
    expect(r!.metrics[0].peerAvg).toBe(92.5);
  });
});

describe("computePeerComparison 雷达归一化", () => {
  it("公司值 2 倍于均值 → 1.0 / 0.5(公司未入榜时比较条取报表值)", () => {
    // 公司不在榜单 → barVal 取报表净利 12, 同业池为公司外两家均值 6
    const b = board("2025-12-31", [
      stock("600809", "山西汾酒", "白酒", { netProfit: 6 }),
      stock("600702", "舍得酒业", "白酒", { netProfit: 6 }),
    ]);
    const r = computePeerComparison(b, null, main("贵州茅台", "白酒"), "sh600519", "贵州茅台")!;
    expect(r.radar[0].company).toBe(1);
    expect(r.radar[0].peer).toBe(0.5);
  });

  it("全 0 值保底 0.02(避免 0/0)", () => {
    const b = board("2025-12-31", [
      stock("600519", "贵州茅台", "白酒", { netProfit: 0, profitYoY: 0, revenueYoY: 0, roe: 0, eps: 0 }),
      stock("600809", "山西汾酒", "白酒", { netProfit: 0, profitYoY: 0, revenueYoY: 0, roe: 0, eps: 0 }),
    ]);
    const r = computePeerComparison(b, null, main("贵州茅台", "白酒"), "sh600519", "贵州茅台")!;
    expect(r.radar[0].company).toBe(0.02);
    expect(r.radar[0].peer).toBe(0.02);
  });

  it("负值(亏损)归一化保底 0.02, 不做符号翻转(与原逻辑一致)", () => {
    const b = board("2025-12-31", [
      stock("600519", "贵州茅台", "白酒", { netProfit: -100 }),
      stock("600809", "山西汾酒", "白酒", { netProfit: 50 }),
    ]);
    const r = computePeerComparison(b, null, main("贵州茅台", "白酒"), "sh600519", "贵州茅台")!;
    expect(r.radar[0].company).toBe(0.02);
    expect(r.radar[0].peer).toBe(0.02);
  });
});
