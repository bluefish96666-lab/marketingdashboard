// WebViewController 是全局类(官方文档: 无需 import), 直接用
// ?tv=1 触发 mrd TV 模式; 无标题栏; TV风格开屏页(加载完成前); 右下角悬浮退出按钮
import {
  WebView, Navigation, Script, Button, ZStack, Spacer, VStack,
  Text, ProgressView, useState, useEffect, Image,
} from "scripting"

const BASE = "https://mrd.hermes.cc.cd/?tv=1"

// 完全复刻 TV app 开屏: 深色底 #070B12 + logo + 应用名 + 副标题 + 进度圈
// (Ui.java buildSplash: BG rgb(7,11,18), TEXT #E2E8F0, ACCENT #0891B2, TEXT_DIM #94A3B8)
function SplashScreen() {
  return (
    <ZStack
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
    >
      <VStack
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        background="#070B12"
        alignment="center"
        spacing={8}
      >
        <Image
          systemName="chart.line.uptrend.xyaxis"
          font={64}
          foregroundStyle="#0891B2"
        />
        <Text
          font="title"
          foregroundStyle="#E2E8F0"
          padding={{ top: 24 }}
        >市场研究驾驶舱</Text>
        <Text
          font="caption"
          foregroundStyle="#0891B2"
          padding={{ top: 8 }}
        >MARKET RESEARCH COCKPIT</Text>
        <ProgressView
          progressViewStyle="circular"
          padding={{ top: 32 }}
        />
        <Text
          font="caption"
          foregroundStyle="#94A3B8"
          padding={{ top: 16 }}
        >正在连接 mrd.hermes.cc.cd …</Text>
      </VStack>
    </ZStack>
  )
}

function FullScreenWebView() {
  const dismiss = Navigation.useDismiss()
  const [loaded, setLoaded] = useState(false)
  const controller = new WebViewController()

  // 加载 URL, waitForLoad 完成后隐藏开屏页
  useEffect(() => {
    controller.loadURL(BASE).then(() => {
      return controller.waitForLoad()
    }).then(() => {
      setLoaded(true)
    }).catch(() => {
      // 加载失败也放行, 避免卡在开屏页
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
