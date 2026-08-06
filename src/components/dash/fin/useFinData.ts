import { useState } from "react";
import { useSharedPolling } from "@/hooks/useSharedPolling";
import { api, type FinanceBoard, type FinanceMain } from "@/lib/api";
import { POLL } from "@/lib/intervals";

/**
 * 共享 financeBoard: 同 period 的所有面板共享一个请求 + 缓存.
 * retry 触发 key 版本递增, 仅影响当前面板(其他面板继续用旧缓存, 下次自动轮询时更新).
 */
export function useFinBoard(period: string) {
  const [retry, setRetry] = useState(0);
  const key = `fb:${period}:r${retry}`;
  const { data, error } = useSharedPolling<FinanceBoard>(key, () => api.financeBoard(period), POLL.FIN);
  return { data, error, loading: data === null && error === null, retry: () => setRetry((r) => r + 1) };
}

/**
 * 共享 financeMain: 同 code 的所有面板共享一个请求 + 缓存.
 */
export function useFinMain(code: string) {
  const [retry, setRetry] = useState(0);
  const key = `fm:${code}:r${retry}`;
  const { data, error } = useSharedPolling<FinanceMain>(key, () => api.financeMain(code), POLL.FIN);
  return { data, error, loading: data === null && error === null, retry: () => setRetry((r) => r + 1) };
}
