// WebViewController 是全局类(官方文档: 无需 import), 直接用
// ?tv=1 触发 mrd TV 模式; 无标题栏; 开屏页(加载完成前); 右下角悬浮退出按钮
import {
  WebView, Navigation, Script, Button, ZStack, Spacer, VStack,
  Text, ProgressView, useState, useEffect,
} from "scripting"

const BASE = "https://mrd.hermes.cc.cd/?tv=1"

function SplashScreen() {
  return (
    <ZStack
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
    >
      <VStack
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        background={"systemBackground"}
        alignment="center"
        spacing={12}
      >
        <Text font="largeTitle">📊</Text>
        <Text font="title2">市场研究驾驶舱</Text>
        <Text font="subheadline" foregroundStyle="secondaryLabel">MRD · 行情 · 资金流向 · AI 基建</Text>
        <ProgressView />
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
