// WebViewController 是全局类(官方文档: 无需 import), 直接用
// ?tv=1 触发 mrd TV 模式; 无标题栏; TV风格开屏页; 右下角悬浮退出按钮
// 结构回归完美版(863f2e9): 无ZStack叠加, 互斥渲染 loaded?WebView:Splash
// 组件值全部在影视集合实证清单内: Text font ∈ caption..title3, foregroundStyle ∈ white/secondaryLabel/tertiaryLabel, background=black
import {
  WebView, Navigation, Script, Button, ZStack, Spacer, VStack,
  Text, ProgressView, useState, useEffect,
} from "scripting"

const BASE = "https://mrd.hermes.cc.cd/?tv=1"

// 复刻 TV app 开屏: 深底 + logo(emoji替代,避未验证symbol) + 应用名 + 副标题 + 进度圈 + 连接提示
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

  useEffect(() => {
    let done = false
    const finish = () => { if (!done) { done = true; setLoaded(true) } }
    // 加载 URL + 等待完成, 5s 超时兜底, 失败也放行
    const timer = setTimeout(finish, 5000)
    controller.loadURL(BASE).then(() => {
      return controller.waitForLoad()
    }).then(finish).catch(finish).finally(() => {
      clearTimeout(timer)
    })
    return () => { clearTimeout(timer); controller.dispose() }
  }, [])

  return (
    <ZStack
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
    >
      {loaded
        ? (
          <WebView
            controller={controller}
            frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
          />
        )
        : <SplashScreen />}
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
