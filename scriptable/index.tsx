import { Script, Device } from "scripting"
import { run } from "./page"

async function main() {
  // TV 模式需横屏: 锁定 landscape(官方 device 文档 API), 退出恢复
  const prev = Device.supportedInterfaceOrientations
  Device.supportedInterfaceOrientations = ["landscapeLeft", "landscapeRight"]
  try {
    await run()
  } catch (error) {
    console.error(error)
  } finally {
    Device.supportedInterfaceOrientations = prev
    Script.exit()
  }
}

main().catch((error) => {
  console.error(error)
  Script.exit()
})
