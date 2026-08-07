// MRD 大盘速览 — 入口
// 组件集与官方影视集合脚本一致(无 Link/Image, 全为已验证组件)
import { Navigation, Script } from "scripting"
import { MainPage } from "./page"

async function run() {
  await Navigation.present({
    element: <MainPage />,
  })
  Script.exit()
}

run()
