// MRD 大盘速览 — 入口(与官方影视集合脚本同构: 纯入口 + 页面分离)
import { Navigation, Script } from "scripting"
import { MainPage } from "./page"

async function main() {
  Script.enableMinimize()
  const removeResumeListener = Script.onResume(() => {})
  try {
    await Navigation.present({
      element: <MainPage />,
      modalPresentationStyle: "overFullScreen",
    })
  } catch (error) {
    console.error(error)
  } finally {
    removeResumeListener()
    Script.exit()
  }
}

main().catch((error) => {
  console.error(error)
  Script.exit()
})
