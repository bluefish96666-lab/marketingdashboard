// MRD 大盘速览 — 脚本宝(Scripting)
// 最简版: 直接打开 mrd 完整 Web 面板(无需 fetch/数据渲染, 零兼容风险)
import {
  Navigation, NavigationStack, List, Section, VStack, HStack, Spacer,
  Text, Button, Image, Script,
} from "scripting"

const BASE = "https://mrd.hermes.cc.cd"

/* ───────── 主页面 ───────── */
function MainPage() {
  return (
    <NavigationStack>
      <List
        navigationTitle="📊 MRD 大盘速览"
        navigationSubtitle="实时行情 · 板块资金流 · AI 基建面板"
      >
        <Section header="打开方式">
          <Button
            title="打开完整面板"
            action={async () => {
              await Navigation.openURL(BASE + "/")
            }}
          />
          <HStack spacing={8}>
            <Image systemName="safari" foregroundStyle="systemBlue" />
            <Text font="footnote" foregroundStyle="secondaryLabel">
              在浏览器中打开 mrd.hermes.cc.cd 完整仪表盘
            </Text>
          </HStack>
        </Section>

        <Section header="快速直达">
          <Button
            title="AI 基建面板"
            action={async () => {
              await Navigation.openURL(BASE + "/ai")
            }}
          />
          <Button
            title="商品行情"
            action={async () => {
              await Navigation.openURL(BASE + "/goods")
            }}
          />
          <Button
            title="财报窗口"
            action={async () => {
              await Navigation.openURL(BASE + "/fin")
            }}
          />
        </Section>

        <Section footer={"数据: SEC / 东财 / OpenRouter / FRED · " + new Date().toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}>
          <VStack spacing={6}>
            <Text font="caption2" foregroundStyle="tertiaryLabel">
              点击上方按钮跳转 Safari 打开对应面板。全部数据由 mrd 服务端实时聚合。
            </Text>
          </VStack>
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
