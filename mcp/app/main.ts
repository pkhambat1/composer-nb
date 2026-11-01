import "./csp.ts"
/* MCP host adapter: owns the SDK connection, input and model context. The shared notebook
   editor owns cells, playback, bricks, sheet music and chord diagrams. For a browser
   preview, pass ?src=<cell>. */
import type {} from "./host-contract.ts"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { App } from "@modelcontextprotocol/ext-apps"
import { NotebookEditor, type SavedCell, type Theme } from "../../playground/src/notebook/index.ts"
import playgroundCss from "../../playground/src/styles/app.css?inline"
import themeCss from "./theme.css?inline"
import { NotebookApp } from "./NotebookApp.tsx"
import { notebookSchema, type NotebookDocument } from "../src/notebook-document.ts"

// The package's version, which Vite writes in (app/vite.config.ts)
declare const __VERSION__: string

const style = document.createElement("style")
style.textContent = playgroundCss + "\n" + themeCss
document.head.append(style)

const $ = (id: string) => {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing MCP App mount: ${id}`)
  return element
}
const status = (text: string) => {
  $("status").textContent = text
  $("status").hidden = !text
}

let app: App | null = null // the host, once connected
let root: Root | null = null
let theme: Theme = "light"
let notebook: NotebookDocument | null = null
// What is drawn now, so a repeat of the input doesn't redraw
let shown: { key: string; cells: SavedCell[]; after: string } | null = null
let edited = false // whether anything played differs from what the assistant wrote

// What the user played, for the assistant to read with their next message. Nothing is sent
// until then, and each update replaces the last.
function updateHostContext(cells: SavedCell[]) {
  if (!app?.getHostCapabilities()?.updateModelContext) return
  const music = cells.filter((c) => c.type === "music")
  const fence = (s: string) => "```composer-nb\n" + s + "\n```"
  const text =
    music.length === 1
      ? `In the composer-nb player, the user changed the cell and played it. It now reads:\n\n${fence(music[0].source)}`
      : `In the composer-nb player, the user changed the cells and played them. They now read, in order:\n\n${music.map((c) => fence(c.source)).join("\n\n")}`
  app.updateModelContext({ content: [{ type: "text", text }] }).catch(() => {})
}

function onRun(cells: SavedCell[]) {
  if (cells.some((c, i) => c.source !== shown?.cells[i]?.source)) edited = true
  if (edited) updateHostContext(cells)
}

function render() {
  if (notebook && app) {
    root ??= createRoot($("cells"))
    root.render(createElement(NotebookApp, { app, initial: notebook, theme }))
    status("")
    return
  }
  if (!shown) return
  root ??= createRoot($("cells"))
  const { key, cells, after } = shown
  root.render(
    createElement(NotebookEditor, { key, single: true, host: { cells, after, theme, onRun } }),
  )
  status("")
}

// The cells to draw, and the source they continue from.
function draw(cells: SavedCell[], after = "") {
  const key = JSON.stringify([cells, after])
  if (key === shown?.key) return
  shown = { key, cells, after }
  edited = false
  render()
}

// The tool's arguments: parse takes a cell, and what it continues from.
function show(args: Record<string, unknown> | undefined) {
  if (typeof args?.source !== "string") return
  draw([{ type: "music", source: args.source }], typeof args.after === "string" ? args.after : "")
}

function applyTheme(context: { theme?: string } | undefined) {
  const next = context?.theme
  if (next !== "dark" && next !== "light") return
  theme = next
  if (shown || notebook) render()
}

function showResult(result: CallToolResult) {
  const parsed = notebookSchema.safeParse(result.structuredContent?.notebook)
  if (parsed.success) {
    notebook = parsed.data
    render()
    return
  }
  if (shown === null) status("The cell wasn't passed to the player. Parse it again.")
}

// The handshake with the host, which then sends the tool's input and result.
async function connect() {
  app = new App(
    { name: "composer-nb", version: __VERSION__ },
    { availableDisplayModes: ["inline", "fullscreen"] },
    { autoResize: true },
  )
  app.ontoolinput = ({ arguments: args }) => show(args)
  app.ontoolinputpartial = () => {}
  app.ontoolresult = showResult
  app.onhostcontextchanged = (context) => applyTheme(context)
  try {
    await app.connect()
    applyTheme(app.getHostContext())
  } catch (err) {
    status(
      `The player couldn't reach its host: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

const query = new URLSearchParams(window.location.search)
if (query.has("src")) {
  if (query.get("theme") === "dark") theme = "dark"
  show({ source: query.get("src"), after: query.get("after") || undefined })
} else if (window.composerNotebookHost) {
  const host = window.composerNotebookHost
  app = host.app
  host.onInput = show
  host.onResult = showResult
  host.onContext = applyTheme
  applyTheme(app.getHostContext())
  show(host.input)
  if (host.result) showResult(host.result)
} else connect()
