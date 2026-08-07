// MRD 大盘速览 — 脚本宝(Scripting)
// 官方模式: Link 组件打开网页(与 App Store限免 同构), 无自定义 API, 零崩溃风险
import {
  Navigation, NavigationStack, List, Section, VStack, HStack, Spacer,
  Text, Link, Script,
} from "scripting"

const BASE = "https://mrd.hermes.cc.cd"

function MainPage() {
  return (
    <NavigationStack>
      <List navigationTitle="MRD 大盘速览">
        <Section header="打开完整面板">
          <Link url={BASE + "/"}>
            <HStack spacing={12} padding={{ vertical: 6 }}>
              <Text font="body" bold>打开 MRD 仪表盘</Text>
              <Spacer />
              <Text font="footnote" foregroundStyle="secondaryLabel">行情 · 板块资金流</Text>
            </HStack>
          </Link>
        </Section>
        <Section header="快速直达">
          <Link url={BASE + "/ai"}>
            <HStack spacing={12} padding={{ vertical: 6 }}>
              <Text font="body">AI 基建面板</Text>
              <Spacer />
              <Text font="footnote" foregroundStyle="secondaryLabel">Token · ROI · 模型价格</Text>
            </HStack>
          </Link>
          <Link url={BASE + "/goods"}>
            <HStack spacing={12} padding={{ vertical: 6 }}>
              <Text font="body">商品行情</Text>
              <Spacer />
              <Text font="footnote" foregroundStyle="secondaryLabel">期货 · 现货基差</Text>
            </HStack>
          </Link>
          <Link url={BASE + "/fin"}>
            <HStack spacing={12} padding={{ vertical: 6 }}>
              <Text font="body">财报窗口</Text>
              <Spacer />
              <Text font="footnote" foregroundStyle="secondaryLabel">披露日历 · 业绩排行</Text>
            </HStack>
          </Link>
        </Section>
        <Section>
          <VStack spacing={4}>
            <Text font="caption">数据: SEC / 东财 / OpenRouter / FRED</Text>
            <Text font="caption">全部由 mrd 服务端实时聚合</Text>
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
