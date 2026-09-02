import { useEffect, useState } from "react";
import { useGmtDemo } from "../gmt-context";

function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `${s}s 前`;
  return `${Math.floor(s / 60)}m${s % 60}s 前`;
}

/** 09 — 数据状态 · 数据源（各组件上报心跳，表格形态对齐 K3） */
export function GmtStatusWidget() {
  const { sources } = useGmtDemo();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const list = Object.entries(sources).sort((a, b) => a[1].label.localeCompare(b[1].label, "zh"));

  return (
    <div className="gmt-rows">
      <table className="gmt-ds-table">
        <thead>
          <tr>
            <th>数据源</th>
            <th>端点 / 口径</th>
            <th>状态</th>
            <th>条数</th>
            <th>最近刷新</th>
          </tr>
        </thead>
        <tbody>
          {!list.length ? (
            <tr>
              <td colSpan={5} className="gmt-insp-empty">等待数据源上报…</td>
            </tr>
          ) : (
            list.map(([k, s]) => {
              const [name, ep] = s.label.split(" · ");
              const stale = now - s.at > 120000;
              return (
                <tr key={k}>
                  <td>{name}</td>
                  <td style={{ color: "var(--gmt-dim)" }}>{ep ?? "—"}</td>
                  <td className={s.ok ? (stale ? "gmt-ds-warn" : "gmt-ds-ok") : "gmt-ds-fail"}>{s.ok ? (stale ? "● 陈旧" : "● 正常") : "● 失败"}</td>
                  <td>{s.n}</td>
                  <td style={{ color: "var(--gmt-dim)" }}>{ago(s.at, now)}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
