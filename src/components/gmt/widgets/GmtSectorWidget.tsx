import { useEffect, useMemo } from "react";
import { usePolling } from "@/hooks/usePolling";
import { api, type Board } from "@/lib/api";
import { POLL } from "@/lib/intervals";
import { clsChg, fmtPct } from "@/lib/format";
import { useGmtDemo } from "../gmt-context";

function SectorRow({ b, maxAbs, active, onClick }: { b: Board; maxAbs: number; active: boolean; onClick: () => void }) {
  const w = maxAbs > 0 ? Math.min(100, (Math.abs(b.pct) / maxAbs) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className="gmt-nw-item"
      style={{
        gridTemplateColumns: "1fr 52px 64px",
        background: active ? "var(--gmt-amber-bg)" : undefined,
        borderLeft: active ? "2px solid var(--gmt-amber)" : undefined,
      }}
    >
      <span>
        <span className="gmt-nw-h">{b.name}</span>
        <span
          style={{
            display: "block",
            marginTop: 2,
            height: 3,
            background: "var(--gmt-line)",
            borderRadius: 1,
          }}
        >
          <span
            style={{
              display: "block",
              height: 3,
              width: `${w}%`,
              background: b.pct >= 0 ? "var(--gmt-up)" : "var(--gmt-down)",
              borderRadius: 1,
            }}
          />
        </span>
      </span>
      <span className={`${clsChg(b.pct)}`} style={{ textAlign: "right", fontWeight: 700 }}>
        {fmtPct(b.pct)}
      </span>
      <span style={{ color: "var(--gmt-dim)", fontSize: 9, textAlign: "right" }}>
        {b.leadName?.slice(0, 4)}
      </span>
    </button>
  );
}

/** 05 — 板块日内走势 */
export function GmtSectorWidget() {
  const { sector, setSector, groups, reportSource } = useGmtDemo();
  const { data: boards, error } = usePolling(() => api.boards("01", 0, 12), POLL.SECTOR, []);

  const list = useMemo(() => boards?.slice(0, 10) ?? [], [boards]);

  useEffect(() => {
    if (boards || error) reportSource("boards", "行业板块 · /api/boards", !error && list.length > 0, list.length);
  }, [boards, error, list.length, reportSource]);
  const maxAbs = useMemo(() => Math.max(...list.map((b) => Math.abs(b.pct)), 0.01), [list]);

  const onPickBoard = (b: Board) => {
    const match = groups.find((g) => g.name.includes(b.name.slice(0, 2)) || b.name.includes(g.name.slice(0, 2)));
    if (match) setSector(match.id);
  };

  return (
    <div className="h-full overflow-y-auto">
      {!list.length ? (
        <p className="gmt-insp-empty" style={{ padding: 8 }}>
          加载板块…
        </p>
      ) : (
        list.map((b) => (
          <SectorRow
            key={b.code}
            b={b}
            maxAbs={maxAbs}
            active={sector !== "ALL" && groups.some((g) => g.id === sector && (g.name.includes(b.name.slice(0, 2)) || b.name.includes(g.name.slice(0, 2))))}
            onClick={() => onPickBoard(b)}
          />
        ))
      )}
      <div className="gmt-bd-note">点击板块 → 联动 01 热力图分组筛选</div>
    </div>
  );
}
