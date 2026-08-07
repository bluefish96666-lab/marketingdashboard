// WebViewController 是全局类(官方文档: 无需 import), 直接用
// ?tv=1 触发 mrd TV 模式; 无标题栏; TV风格开屏页; 右下角悬浮退出按钮
// 组件用法严格对齐影视集合实证: Image font=字符串, Text无padding, ProgressView仅progressViewStyle
import {
  WebView, Navigation, Script, Button, ZStack, Spacer, VStack,
  Text, ProgressView, useState, useEffect, Image,
} from "scripting"

const BASE = "https://mrd.hermes.cc.cd/?tv=1"

// 复刻 TV app 开屏 (Ui.java buildSplash): 深底#070B12 + logo + 应用名 + 副标题 + 进度圈 + 连接提示
function SplashScreen() {
  return (
    <VStack
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      background="#070B12"
      alignment="center"
      spacing={14}
    >
      <Image
        systemName="chart.line.uptrend.xyaxis"
        font="largeTitle"
        foregroundStyle="systemCyan"
      />
      <Text
        font="title2"
        foregroundStyle="systemWhite"
      >市场研究驾驶舱</Text>
      <Text
        font="caption"
        foregroundStyle="systemCyan"
      >MARKET RESEARCH COCKPIT</Text>
      <ProgressView
        progressViewStyle="circular"
      />
      <Text
        font="caption"
        foregroundStyle="secondaryLabel"
      >正在连接 mrd.hermes.cc.cd …</Text>
    </VStack>
  )
}

function FullScreenWebView() {
  const dismiss = Navigation.useDismiss()
  const [loaded, setLoaded] = useState(false)
  const controller = new WebViewController()

  useEffect(() => {
    controller.loadURL(BASE).then(() => {
      return controller.waitForLoad()
    }).then(() => {
      setLoaded(true)
    }).catch(() => {
      setLoaded(true)
    })
    return () => { controller.dispose() }
  }, [])

  return (
    <ZStack
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
    >
      <WebView
        controller={controller}
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      />
      {!loaded && <SplashScreen />}
      <VStack
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        alignment="trailing"
      >
        <Spacer />
        <Button
          title="退出"
          systemImage="xmark"
          action={() => dismiss()}
          padding={{ trailing: 16, bottom: 16 }}
        />
      </VStack>
    </ZStack>
  )
}

export async function run() {
  await Navigation.present({
    element: <FullScreenWebView />,
    modalPresentationStyle: "overFullScreen",
  })
  Script.exit()
}
