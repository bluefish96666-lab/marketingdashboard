import { clsChg, fmtPct, fmtPrice, fmtTime, fmtYuan } from "@/lib/format";
import { tileLabel } from "@/components/dash/heatmap/heatmap-shared";
import { useGmtDemo, type GmtInspectTarget } from "./gmt-context";

function KV({ rows }: { rows: [string, string][] }) {
  return (
    <table className="gmt-kv">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td>{k}</td>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function asOfNow(): string {
  return `${new Date().toLocaleTimeString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" })}（北京 CST）`;
}

function Body({ t }: { t: GmtInspectTarget }) {
  if (t.type === "stock" && t.stock) {
    const s = t.stock;
    return (
      <>
        <div className="gmt-insp-name">{s.name} · {tileLabel(s.code)}</div>
        <div className="gmt-insp-sub">A 股 · 流通市值 {s.circMv.toFixed(0)} 亿（成交额÷换手率反推）</div>
        <div className="gmt-insp-big">
          {fmtPrice(s.price)} <span className={clsChg(s.pct)} style={{ fontSize: 13 }}>{fmtPct(s.pct)}</span>
        </div>
        <KV rows={[["成交额", fmtYuan(s.amount)], ["代码", s.code], ["来源", "腾讯行情 /api/quotes"], ["口径", "日涨跌幅 · 面积=流通市值/成交额"], ["as-of", asOfNow()]]} />
      </>
    );
  }
  if (t.type === "news" && t.news) {
    const n = t.news;
    return (
      <>
        <div className="gmt-insp-name">{n.title || "快讯"}</div>
        <div className="gmt-insp-sub">{fmtTime(n.time)} · 华尔街见闻 7×24</div>
        <p style={{ lineHeight: 1.6, margin: "8px 0" }}>{n.content}</p>
        <KV rows={[["来源", "/api/news · WSCN live"], ["ID", String(n.id)], ["时间", n.time]]} />
      </>
    );
  }
  return (
    <>
      <div className="gmt-insp-name">{t.label ?? "—"}</div>
      <div className="gmt-insp-sub">{t.type === "index" ? "指数 / 汇率" : t.type === "metal" ? "贵金属期货" : "市场 / 口径"}</div>
      {t.price != null && (
        <div className="gmt-insp-big">
          {fmtPrice(t.price)} {t.pct != null && <span className={clsChg(t.pct)} style={{ fontSize: 13 }}>{fmtPct(t.pct)}</span>}
        </div>
      )}
      {t.price == null && t.pct != null && (
        <div className={`gmt-insp-big ${clsChg(t.pct)}`}>{fmtPct(t.pct)}</div>
      )}
      <KV rows={[...(t.rows ?? []), ["as-of", asOfNow()]]} />
    </>
  );
}

/** 右侧固定检查器（K3：▣ 数据 / 来源检查器） */
export function GmtInspector() {
  const { inspect, inspectorOpen, setInspectorOpen, setInspect } = useGmtDemo();
  const close = () => {
    setInspectorOpen(false);
    setInspect(null);
  };
  return (
    <aside className="gmt-inspector" hidden={!inspectorOpen}>
      <div className="gmt-insp-head">
        <span>▣ 数据 / 来源检查器</span>
        <button type="button" onClick={close} aria-label="关闭">✕</button>
      </div>
      <div className="gmt-insp-body">
        {inspect ? (
          <Body t={inspect} />
        ) : (
          <p className="gmt-insp-empty">
            点击任意股票色块、行情带、新闻、板块条、金属卡或市场行，查看其数值、来源、口径与 as-of 时刻。
            <br />
            <br />
            快捷键：[I] 切换检查器 · [D] 数据源 · [F1] 帮助
          </p>
        )}
      </div>
    </aside>
  );
}
