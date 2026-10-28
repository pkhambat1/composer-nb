/* The MCP App: the cells, drawn inside a conversation by a host that renders MCP Apps
   (claude.ai, Claude Desktop). The host hands over the tool's input, the cell's source and
   what it continues from, and it shows as the playground's own: its App, bundled into this
   page, holding just the cell (playground/src/App.tsx, the `host` prop). So the editor, the
   player, the grid, the sheet and the chord diagrams are the website's. The cells are parsed and rendered in this page,
   with nothing asked of the server, and what the user plays is passed back as context for
   Claude's next turn.

   Outside a host, ?src=<cell> draws the cell straight away, for a look in a browser. */
import { createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { App } from "@modelcontextprotocol/ext-apps"
import Playground from "../../playground/src/App.tsx"
import type { SavedCell, Theme } from "../../playground/src/shared/types.ts"
import playgroundCss from "../../playground/src/styles/app.css?inline"
import themeCss from "./theme.css?inline"

// The package's version, which Vite writes in (app/vite.config.js)
declare const __VERSION__: string

const style = document.createElement("style")
style.textContent = playgroundCss + "\n" + themeCss
document.head.append(style)

const $ = (id: string) => document.getElementById(id)!
const status = (text: string) => {
  $("status").textContent = text
  $("status").hidden = !text
}

let app: App | null = null // the host, once connected
let root: Root | null = null
let theme: Theme = "light"
// What is drawn now, so a repeat of the input doesn't redraw
let shown: { key: string; cells: SavedCell[]; after: string } | null = null
let edited = false // whether anything played differs from what Claude wrote

// What the user played, for Claude to read with their next message. Nothing is sent
// until then, and each update replaces the last.
function tellClaude(cells: SavedCell[]) {
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
  if (edited) tellClaude(cells)
}

function render() {
  root ??= createRoot($("cells"))
  const { key, cells, after } = shown!
  root.render(createElement(Playground, { key, host: { cells, after, theme, onRun } }))
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
  if (shown) render()
}

// The handshake with the host, which then sends the tool's input and result.
async function connect() {
  app = new App({ name: "composer-nb", version: __VERSION__ }, {}, { autoResize: true })
  app.ontoolinput = ({ arguments: args }) => show(args)
  app.ontoolinputpartial = () => {}
  app.ontoolresult = () => {
    if (shown === null) status("The cell wasn't passed to the player. Parse it again.")
  }
  app.onhostcontextchanged = (context) => applyTheme(context)
  try {
    await app.connect()
    applyTheme(app.getHostContext())
  } catch (err) {
    status(`The player couldn't reach its host: ${(err as Error)?.message || err}`)
  }
}

const query = new URLSearchParams(window.location.search)
if (query.has("src")) {
  if (query.get("theme") === "dark") theme = "dark"
  show({ source: query.get("src"), after: query.get("after") || undefined })
} else connect()
