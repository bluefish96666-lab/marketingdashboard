// 变量: mrd 仪表盘 — Scriptable 导入脚本
// 功能: ①桌面小组件(widget)显示 A股指数 + 板块资金流Top5 + AI token指数
//       ②App内运行时打开 mrd 完整 Web 面板
// 用法: Scriptable → + 新建脚本 → 粘贴/导入本文件 → 小组件选择本脚本
// 参数(可选): "run" = App内运行(打开Web面板), 默认 = 渲染小组件
// 数据源: https://mrd.hermes.cc.cd/api/* (公网部署)

const BASE = "https://mrd.hermes.cc.cd";

async function getJson(path) {
  const req = new Request(BASE + path);
  req.timeoutInterval = 15;
  const d = await req.loadJSON();
  if (!d.ok) throw new Error(path + " -> " + (d.error || "upstream fail"));
  return d;
}

// ---------- 数据抓取 ----------
async function fetchData() {
  const [quotes, bf, spend] = await Promise.all([
    getJson("/api/quotes?codes=sh000001,sz399001,sz399006,sh000300"),
    getJson("/api/board-flow?n=6"),
    getJson("/api/spend-index"),
  ]);
  const q = quotes.data;
  const boards = (bf.data || []).slice(0, 5);
  const sp = spend.data;
  const idx = ["sh000001", "sz399001", "sz399006", "sh000300"]
    .map((k) => q[k])
    .filter(Boolean);
  const last = sp.points && sp.points.length ? sp.points[sp.points.length - 1] : null;
  return { idx, boards, spend: last };
}

// ---------- 颜色 ----------
const RED = Color.red();
const GREEN = Color.green();
function pctColor(v) { return v >= 0 ? RED : GREEN; }
function pctTxt(v) { return (v >= 0 ? "+" : "") + v.toFixed(2) + "%"; }

// ---------- 小组件渲染 ----------
function fmtYi(v) { return (v / 1e8).toFixed(0) + "亿"; }

// ---------- 主入口 ----------
async function run() {
  const args = (args.widgetParameter || "").trim();
  const data = await fetchData();

  if (args === "run") {
    // App 内运行: 打开完整 Web 面板
    const wv = new WebView();
    await wv.loadURL(BASE + "/");
    await wv.present();
    return;
  }

  const w = new ListWidget();
  w.backgroundColor = new Color("#0c1320");
  w.setPadding(10, 12, 10, 12);

  const title = w.addText("📊 MRD 大盘速览");
  title.font = Font.boldSystemFont(13);
  title.textColor = Color.white();
  w.addSpacer(2);

  // 指数
  for (const i of data.idx) {
    const row = w.addStack();
    row.layoutHorizontally();
    row.addSpacer(0);
    const name = row.addText(i.name);
    name.font = Font.systemFont(10);
    name.textColor = new Color("#cbd5e1");
    row.addSpacer(null);
    const p = row.addText(i.price.toFixed(2) + "  " + pctTxt(i.pct));
    p.font = Font.monospacedSystemFont(10, Font.Medium);
    p.textColor = pctColor(i.pct);
    w.addSpacer(3);
  }
  w.addSpacer(2);

  // 板块资金流
  const bHead = w.addText("资金流向 Top5 (主力净流入)");
  bHead.font = Font.boldSystemFont(10);
  bHead.textColor = new Color("#38bdf8");
  w.addSpacer(2);
  for (const b of data.boards) {
    const row = w.addStack();
    row.layoutHorizontally();
    const nm = row.addText(b.name);
    nm.font = Font.systemFont(10);
    nm.textColor = new Color("#cbd5e1");
    row.addSpacer(null);
    const val = row.addText((b.netIn >= 0 ? "+" : "") + fmtYi(b.netIn));
    val.font = Font.monospacedSystemFont(10, Font.Medium);
    val.textColor = b.netIn >= 0 ? RED : GREEN;
    w.addSpacer(2);
  }

  // AI token 指数
  if (data.spend) {
    w.addSpacer(2);
    const ai = w.addStack();
    ai.layoutHorizontally();
    const aiT = ai.addText("AI token指数  ");
    aiT.font = Font.boldSystemFont(10);
    aiT.textColor = new Color("#a78bfa");
    const aiV = ai.addText(data.spend.indexPoint + "  ·  闭源 $" + data.spend.closed.toFixed(1) + "/M");
    aiV.font = Font.monospacedSystemFont(10, Font.Medium);
    aiV.textColor = new Color("#e2e8f0");
  }

  // 底部
  w.addSpacer(6);
  const foot = w.addText("数据: SEC/东财/OpenRouter · " + new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }));
  foot.font = Font.systemFont(8);
  foot.textColor = new Color("#64748b");

  if (config.runsInWidget) {
    Script.setWidget(w);
  } else {
    w.presentMedium();
  }
  Script.complete();
}

run().catch((e) => {
  const w = new ListWidget();
  w.backgroundColor = new Color("#1a0a0a");
  const t = w.addText("⚠️ 数据获取失败");
  t.font = Font.boldSystemFont(12);
  t.textColor = Color.orange();
  const msg = w.addText(String(e.message || e));
  msg.font = Font.systemFont(9);
  msg.textColor = new Color("#f87171");
  if (config.runsInWidget) Script.setWidget(w); else w.presentMedium();
  Script.complete();
});
