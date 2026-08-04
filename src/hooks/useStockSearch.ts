import { useEffect, useRef, useState, useCallback } from "react";
import { api, type StockSearchResult } from "@/lib/api";

/**
 * 股票搜索 hook: 防抖输入 + 下拉建议 + 键盘导航。
 * 复用 WatchlistPanel / FinCompanyPanel 的搜索交互。
 */
export function useStockSearch() {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<StockSearchResult[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const triggerSearch = useCallback((val: string) => {
    setInput(val);
    clearTimeout(timerRef.current);
    const t = val.trim();
    // 纯数字/代码格式不搜索
    if (/^[\d]{3,6}$/.test(t) || /^(sh|sz|bj)\d{6}$/i.test(t)) {
      setSuggestions([]);
      setShowSuggest(false);
      return;
    }
    if (t.length < 1) {
      setSuggestions([]);
      setShowSuggest(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      try {
        const res = await api.stockSearch(t);
        setSuggestions(res.slice(0, 8));
        setShowSuggest(res.length > 0);
        setHighlightIdx(-1);
      } catch {
        setSuggestions([]);
      }
    }, 200);
  }, []);

  const clear = useCallback(() => {
    setInput("");
    setSuggestions([]);
    setShowSuggest(false);
    setHighlightIdx(-1);
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent, onPick: (s: StockSearchResult) => void) => {
      if (e.nativeEvent.isComposing) return;
      if (e.key === "Enter") {
        if (showSuggest && highlightIdx >= 0 && highlightIdx < suggestions.length) {
          onPick(suggestions[highlightIdx]);
          return;
        }
        if (suggestions.length > 0) {
          onPick(suggestions[0]);
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIdx((i) => (suggestions.length > 0 ? (i + 1) % suggestions.length : -1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIdx((i) => (suggestions.length > 0 ? (i <= 0 ? suggestions.length - 1 : i - 1) : -1));
      } else if (e.key === "Escape") {
        setShowSuggest(false);
      }
    },
    [showSuggest, highlightIdx, suggestions]
  );

  return {
    input,
    setInput,
    triggerSearch,
    suggestions,
    showSuggest,
    setShowSuggest,
    highlightIdx,
    setHighlightIdx,
    clear,
    onKeyDown,
  };
}
