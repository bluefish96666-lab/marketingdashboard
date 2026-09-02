import { clsChg, fmtPct, fmtPrice, fmtTime, fmtYuan } from "@/lib/format";
import { tileLabel } from "@/components/dash/heatmap/heatmap-shared";
import { useGmtDemo } from "./gmt-context";

/** 右侧固定检查器 */
export function GmtInspector() {
  const { inspect, inspectorOpen, setInspectorOpen, setInspect } = useGmtDemo();

  const close = () => {
    setInspectorOpen(false);
    setInspect(null);
  };

  return (
    <aside className="gmt-inspector" hidden={!inspectorOpen}>
      <div className="gmt-insp-head">
        <span>▣ DATA INSPECTOR</span>
        <button type="button" onClick={close} aria-label="关闭">
          ✕
        </button>
      </div>
      <div className="gmt-insp-body">
        {!inspect ? (
          <p className="gmt-insp-empty">
            点击热力图个股或快讯条目，在此查看详情与数据来源。
            <br />
            <br />
            快捷键：[I] 切换检查器 · [F1] 帮助
          </p>
        ) : inspect.type === "stock" && inspect.stock ? (
          <StockDetail stock={inspect.stock} />
        ) : inspect.type === "news" && inspect.news ? (
          <NewsDetail news={inspect.news} />
        ) : inspect.type === "index" ? (
          <>
            <div className="gmt-insp-name">{inspect.indexLabel}</div>
            <div className="gmt-insp-sub">指数 / 汇率 · 统一报价中心</div>
            <div className="gmt-insp-big">
              {fmtPrice(inspect.indexPrice ?? 0)}{" "}
              <span className={clsChg(inspect.indexPct ?? 0)} style={{ fontSize: 13 }}>
                {fmtPct(inspect.indexPct ?? 0)}
              </span>
            </div>
            <table className="gmt-kv">
              <tbody>
                <tr>
                  <td>数据来源</td>
                  <td>腾讯行情 · /api/quotes</td>
                </tr>
                <tr>
                  <td>刷新</td>
                  <td>5s（与行情带同帧）</td>
                </tr>
              </tbody>
            </table>
          </>
        ) : (
          <p className="gmt-insp-empty">无详情</p>
        )}
      </div>
    </aside>
  );
}

function StockDetail({ stock }: { stock: NonNullable<ReturnType<typeof useGmtDemo>["inspect"]>["stock"] }) {
  if (!stock) return null;
  return (
    <>
      <div className="gmt-insp-name">
        {stock.name} · {tileLabel(stock.code)}
      </div>
      <div className="gmt-insp-sub">A股 · 流通市值 {stock.circMv.toFixed(0)} 亿</div>
      <div className="gmt-insp-big">
        {fmtPrice(stock.price)}{" "}
        <span className={clsChg(stock.pct)} style={{ fontSize: 13 }}>
          {fmtPct(stock.pct)}
        </span>
      </div>
      <table className="gmt-kv">
        <tbody>
          <tr>
            <td>成交额</td>
            <td>{fmtYuan(stock.amount)}</td>
          </tr>
          <tr>
            <td>代码</td>
            <td>{stock.code}</td>
          </tr>
          <tr>
            <td>数据来源</td>
            <td>腾讯行情 · 产业链分组</td>
          </tr>
          <tr>
            <td>口径</td>
            <td>流通市值 · 日涨跌幅</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

function NewsDetail({ news }: { news: NonNullable<ReturnType<typeof useGmtDemo>["inspect"]>["news"] }) {
  if (!news) return null;
  return (
    <>
      <div className="gmt-insp-name">{news.title || "快讯"}</div>
      <div className="gmt-insp-sub">{fmtTime(news.time)} · 华尔街见闻</div>
      <p style={{ lineHeight: 1.55, marginTop: 8 }}>{news.content}</p>
      <table className="gmt-kv">
        <tbody>
          <tr>
            <td>来源</td>
            <td>/api/news · WSCN</td>
          </tr>
          <tr>
            <td>ID</td>
            <td>{news.id}</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
