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
    await Navigation.present({ element: <MainPage /> })
  } finally {
    removeResumeListener()
    Script.exit()
  }
}

main().catch((error) => {
  console.error(error)
  Script.exit()
})
