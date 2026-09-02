import { useEffect, useState } from "react";
import { useElementSize } from "@/hooks/useElementSize";
import { EXCHANGES, STATUS_LABEL, fmtCountdown, sessionOf, sessionsInBeijing } from "../gmt-sessions";
import { useGmtDemo } from "../gmt-context";

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

/** 07 — 市场脉搏 · 全球时钟：大钟 + 交易所开闭表 + 24h 时段甘特（北京时间轴） */
export function GmtPulseWidget() {
  const now = useNow();
  const { openInspect } = useGmtDemo();
  const { ref, size } = useElementSize(40);
  const clock = now.toLocaleTimeString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" });
  const date = now.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
  const bjMin = (() => {
    const [h, m] = clock.split(":");
    return +h * 60 + +m;
  })();

  const W = Math.max(size.w, 100);
  const H = Math.max(size.h, 60);
  const rowH = Math.min(18, Math.max(10, (H - 14) / EXCHANGES.length));
  const X = (min: number) => 40 + (min / 1440) * (W - 48);

  return (
    <>
      <div className="gmt-pulse-top">
        <span className="gmt-big-clock">{clock}</span>
        <span className="gmt-big-date">{date} · 北京 CST</span>
        <span className="gmt-big-date" style={{ marginLeft: "auto" }}>
          {EXCHANGES.filter((e) => sessionOf(e, now).status === "OPEN").length} 家交易中
        </span>
      </div>
      <table className="gmt-mk-table">
        <thead>
          <tr>
            <th>市场</th>
            <th>状态</th>
            <th>当地</th>
            <th>常规时段</th>
            <th>下一节点</th>
          </tr>
        </thead>
        <tbody>
          {EXCHANGES.map((ex) => {
            const s = sessionOf(ex, now);
            return (
              <tr
                key={ex.code}
                onClick={() =>
                  openInspect({
                    type: "market",
                    label: `${ex.name} · ${ex.code}`,
                    rows: [["时区", ex.tz], ["当地时间", s.localTime], ["状态", STATUS_LABEL[s.status]], ["常规时段", ex.sessions.map(([o, c]) => `${fmtHM(o)}–${fmtHM(c)}`).join(" / ")], ["口径", "仅常规时段 · 节假日未核实"]],
                  })
                }
              >
                <td>
                  <b>{ex.code}</b> <span style={{ color: "var(--gmt-dim)" }}>{ex.name}</span>
                </td>
                <td>
                  <span className={`gmt-badge ${s.status}`}>{STATUS_LABEL[s.status]}</span>
                </td>
                <td>{s.localTime}</td>
                <td style={{ color: "var(--gmt-dim)" }}>{ex.sessions.map(([o, c]) => `${fmtHM(o)}–${fmtHM(c)}`).join(" · ")}</td>
                <td style={{ color: "var(--gmt-dim)" }}>{s.nextLabel} {fmtCountdown(s.nextIn)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div ref={ref} className="gmt-session-box">
        {size.w > 0 && (
          <svg width={W} height={H} style={{ display: "block" }}>
            {[0, 6, 12, 18, 24].map((h) => (
              <g key={h}>
                <line x1={X(h * 60)} x2={X(h * 60)} y1={2} y2={H - 10} stroke="#292929" />
                <text x={X(h * 60) - 6} y={H - 1} fill="#5a5a5a" fontSize={8}>{String(h).padStart(2, "0")}</text>
              </g>
            ))}
            {EXCHANGES.map((ex, i) => {
              const y = 4 + i * rowH;
              const open = sessionOf(ex, now).status === "OPEN";
              return (
                <g key={ex.code}>
                  <text x={2} y={y + rowH * 0.7} fill="#8a8a8a" fontSize={8}>{ex.code}</text>
                  {sessionsInBeijing(ex, now).map(([a, b], j) => (
                    <rect key={j} x={X(a)} y={y + 1} width={Math.max(1, X(b) - X(a))} height={rowH - 3} fill={open ? "#F28C00" : "#5A3D00"} opacity={open ? 0.9 : 0.6} />
                  ))}
                </g>
              );
            })}
            <line x1={X(bjMin)} x2={X(bjMin)} y1={0} y2={H - 10} stroke="#4DD0E1" strokeWidth={1} strokeDasharray="3,2" />
          </svg>
        )}
      </div>
      <div className="gmt-chart-note">时段甘特以北京时间为横轴 · 青色虚线=现在 · 亮色=交易中 · 节假日/夏令时切换未核实</div>
    </>
  );
}

function fmtHM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
