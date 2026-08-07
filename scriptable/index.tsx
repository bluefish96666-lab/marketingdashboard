// MRD 大盘速览 — 脚本宝(Scripting)脚本
// 数据源: https://mrd.hermes.cc.cd/api/* (SEC/东财/OpenRouter 实时 + 失败兜底)
import {
  Navigation, NavigationStack, List, Section, VStack, HStack, Spacer,
  Text, Button, Image, Widget, fetch, useState, useEffect, Script,
} from "scripting"

const BASE = "https://mrd.hermes.cc.cd"
const CODES = ["sh000001", "sz399001", "sz399006", "sh000300"]

interface Quote { symbol: string; name: string; price: number; pct: number }
interface Board { code: string; name: string; netIn: number }
interface Spend { indexPoint: number; closed: number }

async function getJson(path: string): Promise<any> {
  const r = await fetch(BASE + path, { timeout: 15 })
  const d = JSON.parse(await r.text())
  if (d && d.ok === false) throw new Error(path + " -> " + (d.error || "upstream fail"))
  return d
}

async function fetchData() {
  const [quotes, bf, spend] = await Promise.all([
    getJson("/api/quotes?codes=" + CODES.join(",")),
    getJson("/api/board-flow?n=6"),
    getJson("/api/spend-index"),
  ])
  const q = quotes.data || {}
  const idx: Quote[] = CODES.map((k) => q[k]).filter(Boolean)
  const boards: Board[] = (bf.data || []).slice(0, 5)
  const pts = spend.data?.points
  const last: Spend | null = pts && pts.length ? pts[pts.length - 1] : null
  return { idx, boards, spend: last }
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
  const [data, setData] = useState<{ idx: Quote[]; boards: Board[]; spend: Spend | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchData()
      .then((d) => { if (alive) { setData(d); setError(null) } })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [reload])

  const today = new Date().toLocaleDateString("zh-CN", { month: "numeric", day: "numeric", weekday: "short" })

  return (
    <NavigationStack>
      <List
        navigationTitle="📊 MRD 大盘速览"
        navigationSubtitle={"A股 · " + today + " · 主力资金流"}
        toolbar={{
          leading: null,
          principal: null,
          trailing: (
            <Button title="刷新" action={() => setReload((n) => n + 1)} />
          ),
        }}
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
            <Text font="caption2" foregroundStyle="secondaryLabel">检查网络后点右上角刷新</Text>
          </Section>
        )}

        {data && !error && (
          <>
            <Section header="指数">
              {data.idx.map((i) => (
                <HStack key={i.symbol} spacing={10}>
                  <Text font="subheadline" bold>{i.name}</Text>
                  <Spacer />
                  <Text font="body" monospaced>{i.price.toFixed(2)}</Text>
                  <Text font="subheadline" bold monospaced foregroundStyle={ColorOf(i.pct)}>{pctTxt(i.pct)}</Text>
                </HStack>
              ))}
            </Section>

            <Section header="板块资金流向 Top5 · 主力净流入">
              {data.boards.map((b) => (
                <HStack key={b.code} spacing={10}>
                  <Text font="subheadline">{b.name}</Text>
                  <Spacer />
                  <Text font="subheadline" bold monospaced foregroundStyle={ColorOf(b.netIn)}>{fmtYi(b.netIn)}</Text>
                </HStack>
              ))}
            </Section>

            {data.spend && (
              <Section header="AI Token 指数">
                <HStack spacing={10}>
                  <Text font="subheadline">指数点位</Text>
                  <Spacer />
                  <Text font="body" bold monospaced>{data.spend.indexPoint}</Text>
                </HStack>
                <HStack spacing={10}>
                  <Text font="subheadline">闭源前沿价</Text>
                  <Spacer />
                  <Text font="body" bold monospaced>${data.spend.closed.toFixed(1)}/M</Text>
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
