// MRD 大盘速览 — 页面组件
import {
  NavigationStack, List, Section, VStack, HStack, Spacer,
  Text, Link,
} from "scripting"

const BASE = "https://mrd.hermes.cc.cd"

export function MainPage() {
  return (
    <NavigationStack>
      <List navigationTitle="MRD 大盘速览">
        <Section header="打开完整面板">
          <Link url={BASE + "/"}>
            <HStack spacing={12} padding={{ vertical: 6 }}>
              <Text>打开 MRD 仪表盘</Text>
              <Spacer />
              <Text font="footnote">行情 · 板块资金流</Text>
            </HStack>
          </Link>
        </Section>
        <Section header="快速直达">
          <Link url={BASE + "/ai"}>
            <HStack spacing={12} padding={{ vertical: 6 }}>
              <Text>AI 基建面板</Text>
              <Spacer />
              <Text font="footnote">Token · ROI · 模型价格</Text>
            </HStack>
          </Link>
          <Link url={BASE + "/goods"}>
            <HStack spacing={12} padding={{ vertical: 6 }}>
              <Text>商品行情</Text>
              <Spacer />
              <Text font="footnote">期货 · 现货基差</Text>
            </HStack>
          </Link>
          <Link url={BASE + "/fin"}>
            <HStack spacing={12} padding={{ vertical: 6 }}>
              <Text>财报窗口</Text>
              <Spacer />
              <Text font="footnote">披露日历 · 业绩排行</Text>
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
