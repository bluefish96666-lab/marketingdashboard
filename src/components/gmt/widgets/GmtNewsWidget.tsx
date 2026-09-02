import { useEffect, useMemo } from "react";
import { useSharedPolling } from "@/hooks/useSharedPolling";
import { api, type NewsItem } from "@/lib/api";
import { POLL } from "@/lib/intervals";
import { fmtTime } from "@/lib/format";
import { CHAINS, MACRO_KEYWORDS } from "@/config/dashboard";
import { useGmtDemo } from "../gmt-context";

function tagOf(item: NewsItem): string {
  const text = `${item.title}${item.content}`;
  for (const c of CHAINS) {
    if (c.keywords.some((k) => text.includes(k))) return c.name.slice(0, 4);
  }
  if (MACRO_KEYWORDS.some((k) => text.includes(k))) return "宏观";
  if (/央行|降准|降息|MLF|LPR/.test(text)) return "政策";
  return "快讯";
}

/** 03 — 7×24 快讯 */
export function GmtNewsWidget() {
  const { data, error } = useSharedPolling("gmt:news", () => api.news(40), POLL.NEWS);
  const { setInspect, setInspectorOpen, reportSource } = useGmtDemo();
  const items = useMemo(() => data?.slice(0, 30) ?? [], [data]);

  useEffect(() => {
    if (data || error) reportSource("news", "快讯 · /api/news", !error && items.length > 0, items.length);
  }, [data, error, items.length, reportSource]);

  const onPick = (news: NewsItem) => {
    setInspect({ type: "news", news });
    setInspectorOpen(true);
  };

  return (
    <div className="h-full overflow-y-auto">
      {!items.length ? (
        <p className="gmt-insp-empty" style={{ padding: 8 }}>
          加载快讯…
        </p>
      ) : (
        items.map((item) => (
          <button key={item.id} type="button" className="gmt-nw-item" onClick={() => onPick(item)}>
            <span className="gmt-nw-c">{tagOf(item)}</span>
            <span>
              <span className="gmt-nw-h">{item.title || item.content}</span>
              <span style={{ color: "var(--gmt-faint)", fontSize: 9, marginLeft: 6 }}>{fmtTime(item.time)}</span>
            </span>
          </button>
        ))
      )}
    </div>
  );
}
