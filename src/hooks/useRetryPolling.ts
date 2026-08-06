import { useCallback, useState } from "react";
import { usePolling } from "./usePolling";

/**
 * 带重试的轮询封装 — 消除各面板重复的 `const [retry, setRetry] = useState(0)` 样板。
 * 返回 { data, error, loading, retry }, retry() 触发重新拉取。
 */
export function useRetryPolling<T>(
  fn: () => Promise<T>,
  interval: number,
  deps: readonly unknown[] = [],
  isEqual?: (a: T, b: T) => boolean
) {
  const [retryTick, setRetryTick] = useState(0);
  const retry = useCallback(() => setRetryTick((t) => t + 1), []);
  const { data, error, loading } = usePolling(fn, interval, [...deps, retryTick], isEqual);
  return { data, error, loading, retry };
}
