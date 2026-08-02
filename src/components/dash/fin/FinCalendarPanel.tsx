import { useEffect, useMemo, useRef, useState } from "react";
import { Panel, type PanelZoomProps } from "../Panel";
import { usePolling } from "@/hooks/usePolling";
import { api, type FinCalendarItem } from "@/lib/api";
import { useFin } from "./FinContext";
import { TNUM, prefixCode, quarterLabel } from "./utils";

const DAY = 86400000;

const dateKey = (t: number) => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** 财报日历: 左 = 近 14 天(今日起)披露家数直方图; 右 = 今日/明日披露清单(可点选公司) */
export function FinCalendarPanel({ className = "", ...zoomProps }: { className?: string } & PanelZoomProps) {
  const [retry, setRetry] = useState(0);
  const { data, error, loading } = usePolling(() => api.financeBoard(), 1800000, [retry]);
  const { select } = useFin();

  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 160, h: 120 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => {
      const r = es[0].contentRect;
      if (r.width > 40 && r.height > 40) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]); // 容器仅在拿到数据后挂载, 数据到达时重新挂观察

  const view = useMemo(() => {
    const cal = data?.calendar ?? [];
    const counts = new Map<string, number>();
    for (const it of cal) counts.set(it.date, (counts.get(it.date) ?? 0) + 1);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 14 }, (_, i) => {
      const key = dateKey(today.getTime() + i * DAY);
      return { key, offset: i, count: counts.get(key) ?? 0 };
    });
    const todayKey = days[0].key;
    const peak = Math.max(...days.map((d) => d.count), 0);
    // 右栏: 今日 → 明日 → 最近有披露的一日(降级并标注日期)
    const byDate = new Map<string, FinCalendarItem[]>();
    for (const it of cal) {
      const arr = byDate.get(it.date) ?? [];
      arr.push(it);
      byDate.set(it.date, arr);
    }
    let listDate = todayKey;
    if (!byDate.has(todayKey)) {
      const tmr = dateKey(today.getTime() + DAY);
      // calendar 按公告日倒序, 首条即最近一日
      listDate = byDate.has(tmr) ? tmr : cal[0]?.date ?? todayKey;
    }
    const heavy = new Set((data?.stocks ?? []).map((s) => s.code)); // 净利 TOP50 视作重磅
    return { days, todayKey, todayCount: counts.get(todayKey) ?? 0, peak, list: byDate.get(listDate) ?? [], listDate, heavy };
  }, [data]);

  const { w: W, h: H } = size;
  const chartH = Math.max(H - 16, 40); // 底部 16px 留给统计行
  const padX = 6;
  const slot = (W - padX * 2) / 14;
  const bw = Math.max(3, slot * 0.55);
  const baseY = chartH - 12; // 底部留刻度
  const peak = Math.max(view.peak, 1);

  return (
    <Panel className={className} {...zoomProps} title="财报日历" icon="▦" accent="#38bdf8">
      {!data ? (
        <div className="flex h-full items-center justify-center text-[11px]">
          {loading ? (
            <span className="text-slate-600">数据加载中…</span>
          ) : (
            <button className="h-full w-full text-slate-500" onClick={() => setRetry((r) => r + 1)}>
              数据获取失败，点击重试{error ? `(${error})` : ""}
            </button>
          )}
        </div>
      ) : (
        <div className="flex h-full min-h-0">
          {/* 左: 14 日披露直方图 */}
          <div ref={boxRef} className="flex h-full min-h-0 flex-col" style={{ width: "38%" }}>
            <svg width={W} height={chartH} className="block min-h-0 flex-1">
              {view.days.map((d, i) => {
                const bh = d.count > 0 ? Math.max(2, (d.count / peak) * (baseY - 14)) : 0;
                const x = padX + i * slot + (slot - bw) / 2;
                const isToday = i === 0;
                return (
                  <g key={d.key}>
                    {bh > 0 && (
                      <rect
                        x={x}
                        y={baseY - bh}
                        width={bw}
                        height={bh}
                        rx={2}
                        fill={isToday ? "#fbbf24" : "#22d3ee"}
                        opacity={isToday ? 1 : 0.4}
                      />
                    )}
                    {isToday && d.count > 0 && (
                      <text x={x + bw / 2} y={baseY - bh - 3} fontSize={8} fill="#fbbf24" textAnchor="middle" style={TNUM}>
                        {d.count}
                      </text>
                    )}
                  </g>
                );
              })}
              <line x1={padX} y1={baseY} x2={W - padX} y2={baseY} stroke="#1e293b" strokeWidth={1} />
              {[
                { i: 0, t: "今天", a: "start" as const },
                { i: 3, t: "+3", a: "middle" as const },
                { i: 7, t: "+7", a: "middle" as const },
                { i: 13, t: "+14", a: "end" as const },
              ].map(({ i, t, a }) => (
                <text
                  key={t}
                  x={a === "start" ? padX : a === "end" ? W - padX : padX + i * slot + slot / 2}
                  y={baseY + 9}
                  fontSize={8}
                  fill="#475569"
                  textAnchor={a}
                >
                  {t}
                </text>
              ))}
            </svg>
            <div className="shrink-0 px-1.5 pb-1 text-[10px] text-slate-500" style={TNUM}>
              今日披露 <span className="font-semibold text-amber-400">{view.todayCount}</span> 家 · 近 14 日峰值 {view.peak} 家
            </div>
          </div>
          {/* 右: 今日/明日披露清单 */}
          <div className="flex h-full min-h-0 flex-1 flex-col border-l border-slate-800/60">
            <div className="shrink-0 px-2.5 pt-1.5 text-[10px] text-amber-400">
              {view.listDate === view.todayKey ? "今晚披露" : `${view.listDate.slice(5).replace("-", "/")} 披露`}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto py-0.5">
              {view.list.length === 0 ? (
                <div className="flex h-full items-center justify-center text-[11px] text-slate-600">未来 14 天暂无披露安排</div>
              ) : (
                view.list.map((it) => (
                  <button
                    key={`${it.date}-${it.code}`}
                    onClick={() => select(prefixCode(it.code), it.name)}
                    className="flex h-[18px] w-full items-center gap-1.5 border-b border-slate-800/60 px-2.5 text-left hover:bg-slate-800/30"
                  >
                    <span className="w-[26px] shrink-0 text-[9px] text-slate-500" style={TNUM}>
                      {it.date.slice(5)}
                    </span>
                    <span className="truncate text-[11px] text-slate-300">{it.name}</span>
                    <span className="shrink-0 text-[9px] text-slate-500">{quarterLabel(it.period)}</span>
                    {view.heavy.has(it.code) && <span className="ml-auto shrink-0 text-[9px] text-amber-400">★</span>}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
