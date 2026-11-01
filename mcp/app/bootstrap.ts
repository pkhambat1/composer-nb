import "./csp.ts"
import { App } from "@modelcontextprotocol/ext-apps"
import type { ConnectedHost } from "./host-contract.ts"
declare const __VERSION__: string

const app = new App(
  { name: "composer-nb", version: __VERSION__ },
  { availableDisplayModes: ["inline", "fullscreen"] },
  { autoResize: true },
)
const host: ConnectedHost = { app }
window.composerNotebookHost = host
app.ontoolinput = ({ arguments: input }) => {
  host.input = input
  host.onInput?.(input)
}
app.ontoolinputpartial = () => {}
app.ontoolresult = (result) => {
  host.result = result
  host.onResult?.(result)
}
app.onhostcontextchanged = (context) => host.onContext?.(context)
async function connect() {
  try {
    await app.connect()
    const entry = document.documentElement.dataset.composerApp
    if (!entry) throw new Error("Missing composer renderer URL")
    const script = document.createElement("script")
    script.type = "module"
    script.src = entry
    script.onerror = () => {
      const status = document.getElementById("status")
      if (status)
        status.textContent = "Couldn't load the notebook renderer. Try opening the app again."
    }
    document.body.append(script)
  } catch (error) {
    const status = document.getElementById("status")
    if (status) status.textContent = error instanceof Error ? error.message : String(error)
  }
}
// Keep module evaluation independent of the asynchronous host handshake. Hosts
// can inject this module into an already-loaded sandbox document.
void connect()
