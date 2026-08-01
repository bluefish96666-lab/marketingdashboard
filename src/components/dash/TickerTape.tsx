import { useEffect, useMemo, useState } from "react";
import { clsChg, fmtPct, fmtPrice } from "@/lib/format";
import { isTv } from "@/lib/tv";

export interface TapeItem {
  key: string;
  label: string;
  price: number;
  pct: number;
  digits?: number;
}

function TapeItemView({ it }: { it: TapeItem }) {
  return (
    <>
      <span className="text-slate-400">{it.label}</span>
      <span className="font-semibold text-slate-100" style={{ fontVariantNumeric: "tabular-nums" }}>
        {it.digits === 3 ? it.price.toFixed(3) : fmtPrice(it.price)}
      </span>
      <span className={`${clsChg(it.pct)} font-medium`} style={{ fontVariantNumeric: "tabular-nums" }}>
        {fmtPct(it.pct)}
      </span>
    </>
  );
}

const FLAP_SLOTS = 5;
const FLIP_MS = 4000;

/** TV 翻牌跑马灯: 航班时刻牌式 — 固定5个槽位, 每4s整体左移一格,
 *  只有小区域重绘(弱GPU扛不住全宽滚动图层), 配合 flap-in 翻牌动画 */
function FlapTape({ items }: { items: TapeItem[] }) {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (items.length <= FLAP_SLOTS) return;
    const t = window.setInterval(() => setOffset((o) => (o + 1) % items.length), FLIP_MS);
    return () => window.clearInterval(t);
  }, [items.length]);

  const slots = useMemo(() => {
    const n = Math.min(FLAP_SLOTS, items.length);
    return Array.from({ length: n }, (_, i) => items[(offset + i) % items.length]);
  }, [items, offset]);

  return (
    <div className="flex h-7 items-center justify-between border-b border-slate-700/40 bg-[#0a101c] px-4 text-[11px] leading-7">
      {slots.map((it) => (
        // key 含 item.key: 槽位换内容时重挂载, 触发 flap-in 翻牌动画
        <span key={it.key} className="flap-item inline-flex items-baseline gap-2 whitespace-nowrap">
          <TapeItemView it={it} />
        </span>
      ))}
    </div>
  );
}

/** 顶部跑马灯:全球指数 + 大宗 + 美债(TV 为翻牌模式) */
export function TickerTape({ items }: { items: TapeItem[] }) {
  const content = useMemo(
    () =>
      items.map((it) => (
        <span key={it.key} className="mx-5 inline-flex items-baseline gap-2 whitespace-nowrap">
          <TapeItemView it={it} />
        </span>
      )),
    [items]
  );

  if (isTv) return <FlapTape items={items} />;

  return (
    <div className="ticker-wrap relative h-7 overflow-hidden border-b border-slate-700/40 bg-[#0a101c] text-[11px] leading-7">
      <div className="ticker-track inline-flex items-center will-change-transform">
        <div className="inline-flex">{content}</div>
        <div className="inline-flex" aria-hidden>{content}</div>
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[#070b12] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#070b12] to-transparent" />
    </div>
  );
}
