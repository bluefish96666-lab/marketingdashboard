import { Navigation, Script } from "scripting"
import { MainPage } from "./page"

async function run() {
  await Navigation.present({
    element: <MainPage />,
  })
  Script.exit()
}

run()
