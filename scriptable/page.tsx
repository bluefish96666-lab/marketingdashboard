// WebViewController 是全局类(官方文档: 无需 import), 直接用
// ?tv=1 触发 mrd TV 模式; 无标题栏; TV风格开屏页; 右下角悬浮退出按钮
// 结构=完美版863f2e9: WebView始终挂载 + useEffect loadURL (互斥渲染会致WebView挂载时无加载→黑屏)
// 开屏页=ZStack叠加层, 组件值全部影视集合实证
import {
  WebView, Navigation, Script, Button, ZStack, Spacer, VStack,
  Text, ProgressView, useState, useEffect,
} from "scripting"

const BASE = "https://mrd.hermes.cc.cd/?tv=1"

// 复刻 TV app 开屏: 深底 + logo(emoji) + 应用名 + 副标题 + 进度圈 + 连接提示
function SplashScreen() {
  return (
    <VStack
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      background="black"
      alignment="center"
      spacing={14}
    >
      <Text font="title3">📈</Text>
      <Text
        font="title2"
        fontWeight="bold"
        foregroundStyle="white"
      >市场研究驾驶舱</Text>
      <Text
        font="caption"
        foregroundStyle="secondaryLabel"
      >MARKET RESEARCH COCKPIT</Text>
      <ProgressView
        progressViewStyle="circular"
      />
      <Text
        font="caption"
        foregroundStyle="tertiaryLabel"
      >正在连接 mrd.hermes.cc.cd …</Text>
    </VStack>
  )
}

function FullScreenWebView() {
  const dismiss = Navigation.useDismiss()
  const [loaded, setLoaded] = useState(false)
  const controller = new WebViewController()

  // 完美版结构: WebView 常驻, 挂载后立即 loadURL (加载在 WebView 上进行)
  useEffect(() => {
    controller.loadURL(BASE)
    // waitForLoad 完成或 5s 超时后隐藏开屏
    let done = false
    const finish = () => { if (!done) { done = true; setLoaded(true) } }
    const timer = setTimeout(finish, 5000)
    controller.waitForLoad().then(finish).catch(finish).finally(() => {
      clearTimeout(timer)
    })
    return () => { clearTimeout(timer); controller.dispose() }
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
