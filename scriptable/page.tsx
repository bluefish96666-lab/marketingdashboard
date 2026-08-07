// WebViewController 是全局类(官方文档: 无需 import), 直接用
const BASE = "https://mrd.hermes.cc.cd"

export async function run() {
  const controller = new WebViewController()
  await controller.loadURL(BASE)
  await controller.present({
    fullscreen: true,
    navigationTitle: "MRD 仪表盘",
  })
  controller.dispose()
}
