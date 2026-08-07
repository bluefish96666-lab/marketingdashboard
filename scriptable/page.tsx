// WebViewController 是全局类(官方文档: 无需 import), 直接用
// ?tv=1 触发 mrd TV 模式; 无标题栏; 右下角悬浮退出按钮(官方 useDismiss)
import { WebView, Navigation, Script, Button, ZStack, Spacer, VStack, useEffect } from "scripting"

const BASE = "https://mrd.hermes.cc.cd/?tv=1"

function FullScreenWebView() {
  const dismiss = Navigation.useDismiss()
  const controller = new WebViewController()

  // 关键: 挂载后加载 URL (否则 WebView 空白纯黑)
  useEffect(() => {
    controller.loadURL(BASE)
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
