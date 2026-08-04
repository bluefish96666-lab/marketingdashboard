import { useEffect, useRef, useState } from "react";

/**
 * 监听容器元素实际像素尺寸 — 所有手写 SVG 面板统一使用。
 * 返回 ref (挂载到容器 div) 和当前 {w, h}。
 */
export function useElementSize(threshold = 60) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 400, h: 260 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > threshold && height > threshold) {
        setSize({ w: width, h: height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [threshold]);

  return { ref, size };
}
