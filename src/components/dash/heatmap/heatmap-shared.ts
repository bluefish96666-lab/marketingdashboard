import { MIN_TILE, squarify, type SquarifyRect } from "@/lib/squarify";
import type { HeatStock } from "@/lib/heatmap-data";

export type AggBucket = { _agg: true; members: HeatStock[]; pct: number; t: string };

export function makeAgg(members: HeatStock[], val: (s: HeatStock) => number): AggBucket {
  const sum = members.reduce((a, s) => a + val(s), 0);
  const pct = sum > 0 ? members.reduce((a, s) => a + s.pct * val(s), 0) / sum : 0;
  return { _agg: true, members, pct, t: "其他" };
}

export function layoutGroup(
  members: HeatStock[],
  gx: number,
  gy: number,
  gw: number,
  gh: number,
  val: (s: HeatStock) => number
): { rects: SquarifyRect<HeatStock | AggBucket>[]; aggMembers: HeatStock[] } {
  let keep = members.slice();
  let aggMembers: HeatStock[] = [];
  for (let pass = 0; pass < 12; pass++) {
    const items: (HeatStock | AggBucket)[] = aggMembers.length ? [...keep, makeAgg(aggMembers, val)] : keep;
    const rects = squarify(items, gx, gy, gw, gh, (it) =>
      "_agg" in it && it._agg ? it.members.reduce((a, s) => a + val(s), 0) : val(it as HeatStock)
    );
    let aggRect: SquarifyRect<AggBucket> | undefined;
    const smallIdx: number[] = [];
    rects.forEach((r, i) => {
      if ("_agg" in r.it && r.it._agg) {
        aggRect = r as SquarifyRect<AggBucket>;
        return;
      }
      if (Math.floor(r.w - 1) < MIN_TILE || Math.floor(r.h - 1) < MIN_TILE) smallIdx.push(i);
    });
    const aggTooSmall =
      aggRect != null && (Math.floor(aggRect.w - 1) < MIN_TILE || Math.floor(aggRect.h - 1) < MIN_TILE);
    if (!smallIdx.length && !aggTooSmall) return { rects, aggMembers };
    if (smallIdx.length) {
      const smalls = smallIdx.map((i) => items[i] as HeatStock);
      aggMembers = aggMembers.concat(smalls);
      keep = items.filter((it, i) => smallIdx.indexOf(i) < 0 && !("_agg" in it && it._agg)) as HeatStock[];
    } else if (aggTooSmall && keep.length) {
      let minI = 0;
      keep.forEach((it, i) => {
        if (val(it) < val(keep[minI])) minI = i;
      });
      aggMembers.push(keep[minI]);
      keep.splice(minI, 1);
    } else {
      aggMembers = members.slice();
      keep = [];
      const only = [makeAgg(aggMembers, val)];
      return {
        rects: squarify(only, gx, gy, gw, gh, (it) => it.members.reduce((a, s) => a + val(s), 0)),
        aggMembers,
      };
    }
  }
  const items: (HeatStock | AggBucket)[] = aggMembers.length ? [...keep, makeAgg(aggMembers, val)] : keep;
  return {
    rects: squarify(items, gx, gy, gw, gh, (it) =>
      "_agg" in it && it._agg ? it.members.reduce((a, s) => a + val(s), 0) : val(it as HeatStock)
    ),
    aggMembers,
  };
}

export function stockTip(s: HeatStock, group?: string): string {
  const lines = [
    `${s.code} ${s.name}`,
    `最新 ${s.price.toFixed(2)}  ${s.pct > 0 ? "+" : ""}${s.pct.toFixed(2)}%`,
    `流通市值 ${s.circMv.toFixed(0)} 亿 · 成交额 ${(s.amount / 1e8).toFixed(2)} 亿`,
  ];
  if (group) lines.push(`${group} · 点击查看来源`);
  else lines.push("点击查看来源");
  return lines.join("\n");
}

export function tileLabel(code: string): string {
  const c = code.replace(/^(sh|sz|hk|us)/i, "");
  return c.length > 6 ? c.slice(-6) : c;
}
