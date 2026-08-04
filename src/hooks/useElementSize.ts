import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 监听容器元素实际像素尺寸 — 所有手写 SVG 面板统一使用。
 * 使用 callback ref 确保条件渲染的元素延迟挂载时也能正确观察。
 * 返回 ref (挂载到容器 div) 和当前 {w, h}。
 */
export function useElementSize(threshold = 60) {
  const [size, setSize] = useState({ w: 400, h: 260 });
  const observerRef = useRef<ResizeObserver | null>(null);

  // callback ref: 元素挂载/卸载时由 React 调用, 不依赖 useEffect 时机
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      // 清理旧 observer
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (!el) return;

      const ro = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        if (width > threshold && height > threshold) {
          setSize({ w: width, h: height });
        }
      });
      ro.observe(el);
      observerRef.current = ro;
    },
    [threshold],
  );

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, []);

  return { ref, size };
}
