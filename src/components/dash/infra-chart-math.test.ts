// infra-chart-math 纯函数单测: log刻度/线性刻度/折线分段/剪刀差
import { describe, expect, it } from "vitest";
import type { AiInfraPoint } from "@/lib/api";
import { logY, logTicks, linY, linTicks, seriesPath, priceCostRatio } from "./infra-chart-math";

const pts = (over: Partial<AiInfraPoint>[]): AiInfraPoint[] =>
  over.map((p, i) => ({
    year: 2022 + i, capexB: 100, depB: 30, pricePerM: 10, costPerM: 1, grid: 80, revenueB: 50, roiPct: -50, actual: i < 3, ...p,
  }));

describe("logY/logTicks", () => {
  it("logY 单调递减(值越大 y 越小)", () => {
    const y1 = logY(1, 0.1, 100, 0, 100);
    const y2 = logY(50, 0.1, 100, 0, 100);
    expect(y2).toBeLessThan(y1);
  });
  it("logTicks 生成 1/2/5 序列且在域内", () => {
    const t = logTicks(0.001, 100, 12);
    expect(t.length).toBeGreaterThan(3);
    expect(t.every((v) => v >= 0.0009 && v <= 110)).toBe(true);
    // 含 1/2/5 十进制刻度
    expect(t).toContain(1);
    expect(t).toContain(5);
  });
});

describe("linY/linTicks", () => {
  it("linY 边界映射", () => {
    expect(linY(0, 0, 100, 10, 80)).toBeCloseTo(90); // 最小值在底部
    expect(linY(100, 0, 100, 10, 80)).toBeCloseTo(10); // 最大值在顶部
  });
  it("linTicks 覆盖负值域", () => {
    const t = linTicks(-80, 20);
    expect(t[0]).toBe(-80);
    expect(t[t.length - 1]).toBe(20);
    expect(t.length).toBe(6);
  });
});

describe("seriesPath", () => {
  it("历史/预测分段正确(实线含历史点, 虚线含预测点)", () => {
    const X = (i: number) => i * 10;
    const Y = (v: number) => v;
    const data = pts([
      { pricePerM: 1 }, { pricePerM: 2 }, { pricePerM: 3 }, { pricePerM: 4 }, { pricePerM: 5 },
    ]);
    const { actual, forecast, bridge } = seriesPath(data, "pricePerM", X, Y);
    expect(actual).toContain("M0.0,1.0"); // 2022 起点在实线
    expect(actual).toContain("L20.0,3.0"); // 2024(历史终点)在实线
    expect(forecast).toContain("M30.0,4.0"); // 2025(预测起点)在虚线
    expect(forecast).toContain("L40.0,5.0");
    expect(actual).not.toContain("M30.0"); // 预测点不在实线
    expect(bridge).toContain("M20.0,3.0"); // 连接段从历史终点出发
    expect(bridge).toContain("L30.0,4.0"); // 到预测起点
  });
  it("空值跳过不产生断裂命令", () => {
    const X = (i: number) => i * 10;
    const data = pts([{ pricePerM: 1 }, { pricePerM: Number.NaN }, { pricePerM: 3 }]);
    const { actual, bridge } = seriesPath(data, "pricePerM", X, (v) => v);
    expect(actual).toContain("M0.0,1.0");
    expect(actual).toContain("M20.0,3.0"); // NaN 后重新起段
    expect(actual).not.toContain("L10.0"); // 无跳段连线
    expect(bridge).toBe(""); // 无历史→预测切换时 bridge 为空
  });
});

describe("priceCostRatio", () => {
  it("剪刀差比值 = price/cost 且逐年扩张", () => {
    const data = pts([
      { pricePerM: 10, costPerM: 5 }, { pricePerM: 8, costPerM: 2 }, { pricePerM: 6, costPerM: 0.5 },
    ]);
    const r = priceCostRatio(data);
    expect(r.map((x) => x.ratio)).toEqual([2, 4, 12]);
  });
  it("过滤无效值(0 或负)", () => {
    const data = pts([{ pricePerM: 0, costPerM: 5 }, { pricePerM: 10, costPerM: 0 }, { pricePerM: 8, costPerM: 2 }]);
    expect(priceCostRatio(data)).toEqual([{ year: 2024, ratio: 4 }]);
  });
});
