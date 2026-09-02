import { useCallback, useEffect, useRef, useState } from "react";
import { isWatchableTicker, normalizeWatchTicker } from "@/lib/code";
import {
  hostingToken, hostingWatchlist, hostingWatchlistSave,
  loadWatchlistCache, saveWatchlistCache,
} from "@/lib/hosting";
import { detectBackend, readRemote, write } from "@/lib/layout-sync";
import { loadWatchlist, sanitizeWatchlist, saveWatchlist } from "@/lib/watchlist";

const SYNC_KEY = "watchlist";

/**
 * 自选股增删 + 持久化:
 * - 托管(有 token): 走专用 /api/hosting/watchlist(按租户隔离), 行为不变
 * - 自部署同步(SELFHOST_SYNC_KEY): 经 layout-sync key "watchlist" 跨设备同步
 * - 仅本机: localStorage(dash:watchlist, 与 WatchlistPanel 同一把钥匙)
 */
export function useWatchlist() {
  const [codes, setCodes] = useState<string[]>(loadWatchlist);
  const [hosted, setHosted] = useState<boolean | null>(() => (hostingToken() ? null : false));
  const skipWriteRef = useRef(true);

  useEffect(() => {
    let alive = true;
    if (hostingToken()) {
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
    }
    (async () => {
      const b = await detectBackend();
      if (b !== "selfhost") return;
      const remote = await readRemote<unknown>(SYNC_KEY);
      if (!alive) return;
      const clean = sanitizeWatchlist(remote);
      if (clean) {
        skipWriteRef.current = true;
        setCodes(clean);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (hosted === null) return;
    if (hosted) {
      hostingWatchlistSave(codes).then((saved) => saveWatchlistCache(saved)).catch(() => {});
      return;
    }
    saveWatchlist(codes);
    if (skipWriteRef.current) {
      skipWriteRef.current = false;
      return;
    }
    write(SYNC_KEY, codes);
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
