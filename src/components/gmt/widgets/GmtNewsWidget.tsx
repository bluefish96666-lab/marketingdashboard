import { useEffect, useMemo, useRef, useState } from "react";
import { useSharedPolling } from "@/hooks/useSharedPolling";
import { api, type NewsItem } from "@/lib/api";
import { POLL } from "@/lib/intervals";
import { fmtTime } from "@/lib/format";
import { CHAINS, MACRO_KEYWORDS } from "@/config/dashboard";
import { useGmtDemo } from "../gmt-context";

const METAL_KW = ["黄金", "白银", "铜", "金价", "贵金属", "铝", "锂"];

function tagOf(item: NewsItem): string {
  const text = `${item.title}${item.content}`;
  for (const c of CHAINS) if (c.keywords.some((k) => text.includes(k))) return c.name;
  if (METAL_KW.some((k) => text.includes(k))) return "金属";
  if (MACRO_KEYWORDS.some((k) => text.includes(k)) || /央行|降准|降息|MLF|LPR|美联储/.test(text)) return "宏观";
  return "快讯";
}

const FILTERS = ["全部", "大模型", "半导体", "新能源", "创新药", "宏观", "金属"];

/** 03 — 新闻快讯：关键词 chip 过滤 + 自动滚动 + 两行条目（K3 形态） */
export function GmtNewsWidget() {
  const { data, error } = useSharedPolling("gmt:news", () => api.news(60), POLL.NEWS);
  const { openInspect, reportSource } = useGmtDemo();
  const [filter, setFilter] = useState("全部");
  const [kw, setKw] = useState("");
  const [auto, setAuto] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);
  const seenRef = useRef<Set<number>>(new Set());
  const [unread, setUnread] = useState<Set<number>>(new Set());

  const tagged = useMemo(() => (data ?? []).map((n) => ({ n, tag: tagOf(n) })), [data]);
  const items = useMemo(() => {
    const q = kw.trim();
    return tagged
      .filter((t) => filter === "全部" || t.tag === filter)
      .filter((t) => !q || t.n.title.includes(q) || t.n.content.includes(q))
      .slice(0, 40);
  }, [tagged, filter, kw]);

  useEffect(() => {
    if (!data) return;
    const fresh = data.filter((d) => !seenRef.current.has(d.id)).map((d) => d.id);
    if (seenRef.current.size && fresh.length) {
      setUnread(new Set(fresh));
      if (auto) boxRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
    data.forEach((d) => seenRef.current.add(d.id));
  }, [data, auto]);

  useEffect(() => {
    if (data || error) reportSource("news", "快讯 · /api/news", !error && (data?.length ?? 0) > 0, data?.length ?? 0);
  }, [data, error, reportSource]);

  return (
    <>
      <div className="gmt-ctl-row">
        {FILTERS.map((f) => (
          <button key={f} type="button" className={`gmt-chip${filter === f ? " on" : ""}`} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
        <button type="button" className={`gmt-chip${auto ? " on" : ""}`} onClick={() => setAuto((v) => !v)} title="新快讯到达时滚到顶部">
          {auto ? "▶ 自动" : "❚❚ 手动"}
        </button>
        <input type="search" className="gmt-search" value={kw} onChange={(e) => setKw(e.target.value)} placeholder="✕ 关键词" aria-label="关键词过滤" />
      </div>
      <div ref={boxRef} className="gmt-rows">
        {!items.length ? (
          <p className="gmt-insp-empty" style={{ padding: 8 }}>
            {error ? "快讯不可用" : data ? "无匹配快讯" : "加载快讯…"}
          </p>
        ) : (
          items.map(({ n, tag }) => (
            <button
              key={n.id}
              type="button"
              className={`gmt-nw-item${unread.has(n.id) ? " unread" : ""}`}
              onClick={() => openInspect({ type: "news", news: n })}
            >
              <span className="gmt-nw-c">{tag}</span>
              <span style={{ minWidth: 0 }}>
                <span className="gmt-nw-h">{n.title || n.content}</span>
                <span className="gmt-nw-e">
                  {fmtTime(n.time)} · {n.title ? n.content : "华尔街见闻"}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
    </>
  );
}
