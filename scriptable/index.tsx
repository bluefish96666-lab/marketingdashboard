// MRD 大盘速览 — 脚本宝(Scripting)调试版
// 每个请求的中间状态直接渲染到页面, 便于定位卡点
import {
  Navigation, NavigationStack, List, Section, VStack, HStack, Spacer,
  Text, Button, fetch, useState, useEffect, Script,
} from "scripting"

const BASE = "https://mrd.hermes.cc.cd"
const CODES = ["sh000001", "sz399001", "sz399006", "sh000300"]

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
  const [step, setStep] = useState<string>("初始化")
  const [log, setLog] = useState<string[]>([])

  useEffect(() => {
    let active = true
    const add = (m: string) => { if (active) setLog((prev) => [...prev, m]) }

    add("开始请求 " + BASE)

    fetch(BASE + "/api/quotes?codes=" + CODES.join(","), { timeout: 15 })
      .then(async (r) => {
        add("quotes HTTP " + r.status)
        const text = await r.text()
        add("quotes 文本长度 " + text.length)
        const d = JSON.parse(text)
        add("quotes 解析 ok=" + String(d.ok) + " keys=" + (d.data ? Object.keys(d.data).join(",") : "无"))
        const q = d.data || {}
        const list = CODES.map((k) => q[k]).filter(Boolean)
        add("指数 " + list.length + " 个: " + list.map((i: any) => i.name + " " + i.price).join(" / "))

        const r2 = await fetch(BASE + "/api/board-flow?n=6", { timeout: 15 })
        add("board-flow HTTP " + r2.status)
        const d2 = JSON.parse(await r2.text())
        const boards = (d2.data || []).slice(0, 5)
        add("板块 " + boards.length + " 个: " + boards.map((b: any) => b.name).join(" / "))

        const r3 = await fetch(BASE + "/api/spend-index", { timeout: 15 })
        add("spend-index HTTP " + r3.status)
        const d3 = JSON.parse(await r3.text())
        const pts = d3.data && d3.data.points
        add("spend 点数 " + (pts ? pts.length : 0))

        if (active) { setStep("完成"); setLog((prev) => [...prev, "✅ 全部请求成功"]) }
      })
      .catch((e: unknown) => {
        const m = e instanceof Error ? e.message : String(e)
        if (active) { setStep("错误: " + m); setLog((prev) => [...prev, "❌ " + m]) }
      })

    return () => { active = false }
  }, [])

  return (
    <NavigationStack>
      <List navigationTitle="📊 MRD 调试" navigationSubtitle={"状态: " + step}>
        <Section header="请求日志">
          {log.length === 0 && (
            <Text font="caption" foregroundStyle="secondaryLabel">暂无日志…</Text>
          )}
          {log.map((m, i) => (
            <Text key={i} font="caption" foregroundStyle="secondaryLabel">{m}</Text>
          ))}
        </Section>
        <Section>
          <Button title="重新运行" action={() => { setLog([]); setStep("重跑"); location.reload?.() }} />
        </Section>
      </List>
    </NavigationStack>
  )
}

async function run() {
  await Navigation.present(<MainPage />)
  Script.exit()
}

run()
