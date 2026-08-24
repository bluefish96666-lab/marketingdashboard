import { useCallback, useEffect, useState } from "react";
import { isWatchableTicker, normalizeWatchTicker } from "@/lib/code";
import {
  hostingToken, hostingWatchlist, hostingWatchlistSave,
  loadWatchlistCache, saveWatchlistCache,
} from "@/lib/hosting";
import { loadWatchlist, saveWatchlist } from "@/lib/watchlist";

/** 自选股增删 + 持久化(开源 localStorage / 托管走服务端) */
export function useWatchlist() {
  const [codes, setCodes] = useState<string[]>(loadWatchlist);
  const [hosted, setHosted] = useState<boolean | null>(() => (hostingToken() ? null : false));

  useEffect(() => {
    if (!hostingToken()) return;
    let alive = true;
    (async () => {
      try {
        const server = await hostingWatchlist();
        if (!alive) return;
        setCodes(Array.isArray(server) ? server.filter(isWatchableTicker) : []);
        setHosted(true);
      } catch {
        if (!alive) return;
        const cached = loadWatchlistCache();
        if (cached && cached.length > 0) setCodes(cached.filter(isWatchableTicker));
        setHosted(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (hosted === null) return;
    if (hosted) {
      hostingWatchlistSave(codes).then((saved) => saveWatchlistCache(saved)).catch(() => {});
    } else {
      saveWatchlist(codes);
    }
  }, [codes, hosted]);

  const addCode = useCallback((raw: string): boolean => {
    const c = normalizeWatchTicker(raw);
    if (!isWatchableTicker(c)) return false;
    setCodes((cs) => (cs.includes(c) ? cs : [...cs, c]));
    return true;
  }, []);

  const removeCode = useCallback((code: string) => {
    setCodes((cs) => cs.filter((c) => c !== code));
  }, []);

  return { codes, addCode, removeCode };
}
