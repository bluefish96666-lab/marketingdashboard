// 产业链纯业务函数 — 与 UI 分离(可单测)
import type { Chain, ChainSegment } from "@/config/dashboard";

/** 从问财解析结果构建自定义链(add 模式) */
export function buildChainFromParse(
  name: string,
  parsed: { segments: { name: string; desc: string; stocks: { code: string; name: string }[] }[] }
): Chain {
  return {
    id: "custom_" + Date.now(),
    name,
    icon: "▣",
    segments: parsed.segments.map((seg, si) => ({
      name: seg.name || `${["上游", "中游", "下游"][si] || "环节" + (si + 1)}`,
      desc: seg.desc || "",
      stocks: seg.stocks.map((s) => ({ code: s.code, name: s.name, tag: seg.name })),
    })),
    tech: parsed.segments.flatMap((s) => {
      const ts = s.name?.match(/[（(][^)）]*[)）]/g)?.map((t) => t.replace(/[（()）]/g, "")) || [];
      return ts;
    }).filter(Boolean).slice(0, 12),
    keywords: [name],
  };
}

/** 用问财解析结果覆盖已有链的股票(update 模式) */
export function updateChainSegments(
  segments: ChainSegment[],
  parsed: { segments: { stocks: { code: string; name: string }[] }[] }
): ChainSegment[] {
  return segments.map((seg, si) => ({
    ...seg,
    stocks: parsed.segments[si]?.stocks.map((s) => ({ code: s.code, name: s.name, tag: seg.desc?.split("·")?.[0]?.trim() || seg.name })) || seg.stocks,
  }));
}
