import { Script } from "scripting"
import { run } from "./page"

async function main() {
  try {
    await run()
  } catch (error) {
    console.error(error)
  } finally {
    Script.exit()
  }
}

main().catch((error) => {
  console.error(error)
  Script.exit()
})
