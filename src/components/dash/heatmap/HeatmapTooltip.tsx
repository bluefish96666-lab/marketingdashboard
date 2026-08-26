import { useCallback, useEffect, useState } from "react";

/** GMT 风格：tooltip 跟随鼠标 */
export function useCursorTooltip() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);

  const show = useCallback((text: string, x: number, y: number) => {
    setTip({ text, x, y });
  }, []);

  const hide = useCallback(() => setTip(null), []);

  useEffect(() => {
    if (!tip) return;
    const onScroll = () => hide();
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [tip, hide]);

  return { tip, show, hide };
}

export function CursorTooltip({
  tip,
  accent = "amber",
}: {
  tip: { text: string; x: number; y: number } | null;
  accent?: "amber" | "gold";
}) {
  if (!tip) return null;
  const border = accent === "amber" ? "#F28C00" : "#f5c542";
  let lx = tip.x + 14;
  let ly = tip.y + 12;
  if (typeof window !== "undefined") {
    if (lx + 220 > window.innerWidth - 8) lx = tip.x - 220;
    if (ly + 100 > window.innerHeight - 8) ly = tip.y - 90;
  }
  return (
    <div
      className="pointer-events-none fixed z-[9999] max-w-[240px] whitespace-pre-wrap border bg-black px-2 py-1 font-mono text-[10px] leading-snug text-[#d7d7d7] shadow-lg"
      style={{ left: lx, top: ly, borderColor: border }}
      role="tooltip"
    >
      {tip.text}
    </div>
  );
}
