// WebViewController 是全局类(官方文档: 无需 import), 直接用
// ?tv=1 触发 mrd TV 模式: D-pad 空间导航 + 面板点击全屏放大 + 性能适配
const BASE = "https://mrd.hermes.cc.cd/?tv=1"

export async function run() {
  const controller = new WebViewController()
  await controller.loadURL(BASE)
  await controller.present({
    fullscreen: true,
    navigationTitle: "MRD 仪表盘",
  })
  controller.dispose()
}
