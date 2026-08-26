/** 热力矩阵色阶 — 红涨绿跌 (A 股), 强度映射 ±4% */

export interface HeatColor {
  bg: string;
  fg: string;
}

export function heatColor(pct: number): HeatColor {
  const t = Math.min(1, Math.abs(pct) / 4);
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  if (pct > 0.05) {
    return {
      bg: `rgb(${lerp(42, 255)},${lerp(11, 77)},${lerp(12, 79)})`,
      fg: t > 0.55 ? "#000" : "#FFD9DA",
    };
  }
  if (pct < -0.05) {
    return {
      bg: `rgb(${lerp(11, 0)},${lerp(42, 193)},${lerp(27, 118)})`,
      fg: t > 0.55 ? "#000" : "#D7D7D7",
    };
  }
  return { bg: "#141414", fg: "#8A8A8A" };
}
