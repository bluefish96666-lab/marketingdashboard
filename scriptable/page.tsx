import {
  NavigationStack, VStack, HStack, Spacer,
  Text, Button, fetch, useState, useEffect,
} from "scripting"

const BASE = "https://mrd.hermes.cc.cd"
const CODES = ["sh000001", "sz399001", "sz399006", "sh000300"]

interface Quote { symbol: string; name: string; price: number; pct: number }
interface Board { code: string; name: string; netIn: number }

async function getJson(path: string): Promise<any> {
  const r = await fetch(BASE + path, { timeout: 15 })
  const d = await r.json()
  if (d && d.ok === false) throw new Error(path + " upstream fail")
  return d
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

export function MainPage() {
  const [idx, setIdx] = useState<Quote[]>([])
  const [boards, setBoards] = useState<Board[]>([])
  const [spend, setSpend] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const q1 = await getJson("/api/quotes?codes=" + CODES.join(","))
        if (!active) return
        const q = q1.data || {}
        setIdx(CODES.map((k) => q[k]).filter(Boolean))

        const q2 = await getJson("/api/board-flow?n=6")
        if (!active) return
        setBoards((q2.data || []).slice(0, 5))

        const q3 = await getJson("/api/spend-index")
        if (!active) return
        const pts = q3.data && q3.data.points
        if (pts && pts.length) setSpend(pts[pts.length - 1].closed)

        if (active) { setError(null); setLoading(false) }
      } catch (e) {
        if (active) { setError(e instanceof Error ? e.message : String(e)); setLoading(false) }
      }
    }
    load()
    return () => { active = false }
  }, [reloadKey])

  return (
    <NavigationStack>
      <VStack navigationTitle="MRD 大盘速览" navigationBarTitleDisplayMode="inline">
        {loading && (
          <HStack spacing={8} padding={16}>
            <Spacer />
            <Text font="footnote">数据加载中…</Text>
            <Spacer />
          </HStack>
        )}
        {error && (
          <VStack spacing={6} padding={16}>
            <Text font="footnote">数据获取失败</Text>
            <Text font="caption">{error}</Text>
          </VStack>
        )}
        {!loading && !error && (
          <VStack spacing={6} padding={12}>
            <Text font="headline">指数</Text>
            {idx.map((i) => (
              <HStack key={i.symbol} spacing={10}>
                <Text font="subheadline">{i.name}</Text>
                <Spacer />
                <Text font="body">{i.price.toFixed(2)}</Text>
                <Text font="subheadline" foregroundStyle={ColorOf(i.pct)}>{pctTxt(i.pct)}</Text>
              </HStack>
            ))}
            <Text font="headline" padding={{ top: 12 }}>板块资金流向 Top5</Text>
            {boards.map((b) => (
              <HStack key={b.code} spacing={10}>
                <Text font="subheadline">{b.name}</Text>
                <Spacer />
                <Text font="subheadline" foregroundStyle={ColorOf(b.netIn)}>{fmtYi(b.netIn)}</Text>
              </HStack>
            ))}
            {spend != null && (
              <>
                <Text font="headline" padding={{ top: 12 }}>AI Token 指数</Text>
                <HStack spacing={10}>
                  <Text font="subheadline">闭源前沿价</Text>
                  <Spacer />
                  <Text font="body">${spend.toFixed(1)}/M</Text>
                </HStack>
              </>
            )}
          </VStack>
        )}
        <Spacer />
        <Button title="重新加载" action={() => setReloadKey((n) => n + 1)} />
      </VStack>
    </NavigationStack>
  )
}
