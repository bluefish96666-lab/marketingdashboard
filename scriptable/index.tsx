// MRD 大盘速览 — 脚本宝(Scripting)脚本
// 数据源: https://mrd.hermes.cc.cd/api/* (SEC/东财/OpenRouter 实时 + 失败兜底)
import {
  Navigation, NavigationStack, List, Section, VStack, HStack, Spacer,
  Text, Button, fetch, useState, useEffect, Script,
} from "scripting"

const BASE = "https://mrd.hermes.cc.cd"
const CODES = ["sh000001", "sz399001", "sz399006", "sh000300"]

interface Quote { symbol: string; name: string; price: number; pct: number }
interface Board { code: string; name: string; netIn: number }
interface Spend { indexPoint: number; closed: number }

async function getJson(path: string): Promise<any> {
  const r = await fetch(BASE + path, { timeout: 15 })
  const text = await r.text()
  const d = JSON.parse(text)
  if (d && d.ok === false) throw new Error(path + " -> " + (d.error || "upstream fail"))
  return d
}

/** fetch 挂起保护: 指定秒数后强制抛错, 防止 loading 无限转圈 */
function withTimeout<T>(p: Promise<T>, secs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label + " 超时(" + secs + "s)")), secs * 1000)
    p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })
}

function pctTxt(v: number): string {
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%"
}

function fmtYi(v: number): string {
  return (v >= 0 ? "+" : "") + (v / 1e8).toFixed(0) + "亿"
}

function ColorOf(v: number): string {
  return v >= 0 ? "systemRed" : "systemGreen"
}

/* ───────── 主页面 ───────── */
function MainPage() {
  const [idx, setIdx] = useState<Quote[]>([])
  const [boards, setBoards] = useState<Board[]>([])
  const [spend, setSpend] = useState<Spend | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        // 逐个请求, 不用 Promise.all(脚本宝运行时兼容性); 每步带超时保护
        const quotes = await withTimeout(getJson("/api/quotes?codes=" + CODES.join(",")), 10, "quotes")
        if (!active) return
        const q = quotes.data || {}
        const list: Quote[] = CODES.map((k) => q[k]).filter(Boolean)
        setIdx(list)

        const bf = await withTimeout(getJson("/api/board-flow?n=6"), 10, "board-flow")
        if (!active) return
        setBoards((bf.data || []).slice(0, 5))

        const sp = await withTimeout(getJson("/api/spend-index"), 10, "spend-index")
        if (!active) return
        const pts = sp.data && sp.data.points
        const last: Spend | null = pts && pts.length ? pts[pts.length - 1] : null
        setSpend(last)

        if (active) { setError(null); setLoading(false) }
      } catch (e) {
        if (active) { setError(e instanceof Error ? e.message : String(e)); setLoading(false) }
      }
    }
    load()
    return () => { active = false }
  }, [])

  const today = new Date().toLocaleDateString("zh-CN", { month: "numeric", day: "numeric", weekday: "short" })

  return (
    <NavigationStack>
      <List
        navigationTitle="📊 MRD 大盘速览"
        navigationSubtitle={"A股 · " + today + " · 主力资金流"}
      >
        {loading && (
          <Section>
            <VStack spacing={6} padding={16}>
              <Spacer />
              <Text font="caption" foregroundStyle="secondaryLabel">数据加载中…</Text>
              <Spacer />
            </VStack>
          </Section>
        )}

        {error && (
          <Section header="⚠️ 数据获取失败">
            <Text font="footnote" foregroundStyle="systemRed">{error}</Text>
            <Text font="caption2" foregroundStyle="secondaryLabel">检查网络后重试</Text>
          </Section>
        )}

        {!loading && !error && (
          <>
            <Section header="指数">
              {idx.map((i) => (
                <HStack key={i.symbol} spacing={10}>
                  <Text font="subheadline" bold>{i.name}</Text>
                  <Spacer />
                  <Text font="body" monospaced>{i.price.toFixed(2)}</Text>
                  <Text font="subheadline" bold monospaced foregroundStyle={ColorOf(i.pct)}>{pctTxt(i.pct)}</Text>
                </HStack>
              ))}
            </Section>

            <Section header="板块资金流向 Top5 · 主力净流入">
              {boards.map((b) => (
                <HStack key={b.code} spacing={10}>
                  <Text font="subheadline">{b.name}</Text>
                  <Spacer />
                  <Text font="subheadline" bold monospaced foregroundStyle={ColorOf(b.netIn)}>{fmtYi(b.netIn)}</Text>
                </HStack>
              ))}
            </Section>

            {spend && (
              <Section header="AI Token 指数">
                <HStack spacing={10}>
                  <Text font="subheadline">指数点位</Text>
                  <Spacer />
                  <Text font="body" bold monospaced>{spend.indexPoint}</Text>
                </HStack>
                <HStack spacing={10}>
                  <Text font="subheadline">闭源前沿价</Text>
                  <Spacer />
                  <Text font="body" bold monospaced>${spend.closed.toFixed(1)}/M</Text>
                </HStack>
              </Section>
            )}

            <Section footer={"数据: SEC / 东财 / OpenRouter · " + new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}>
              <Button title="打开完整面板" action={async () => { await Navigation.openURL(BASE + "/") }} />
            </Section>
          </>
        )}
      </List>
    </NavigationStack>
  )
}

async function run() {
  await Navigation.present(<MainPage />)
  Script.exit()
}

run()
