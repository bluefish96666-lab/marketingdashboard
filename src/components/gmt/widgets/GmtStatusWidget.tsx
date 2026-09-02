import { useEffect, useState } from "react";
import { useGmtDemo } from "../gmt-context";

function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${s % 60}s`;
}

/** 09 — 数据状态：各组件上报的数据源心跳（Kimi 09 "data status" 对应） */
export function GmtStatusWidget() {
  const { sources } = useGmtDemo();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const list = Object.entries(sources);

  return (
    <div className="gmt-status">
      {!list.length ? (
        <span className="gmt-insp-empty">等待数据源上报…</span>
      ) : (
        list.map(([k, s]) => (
          <span key={k} className="gmt-status-item" title={s.label}>
            <span style={{ color: s.ok ? "#00c176" : "#ff4d4f" }}>●</span>
            <span>{s.label.split(" · ")[0]}</span>
            <span style={{ color: "var(--gmt-faint)" }}>
              {s.n} · {ago(s.at, now)}
            </span>
          </span>
        ))
      )}
    </div>
  );
}
