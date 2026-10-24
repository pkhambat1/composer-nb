/* The MCP App: the player, drawn inside a conversation by a host that renders MCP Apps
   (claude.ai, Claude Desktop). The host hands over the tool's input, the cell's source and
   the cells it continues from, and the library draws the same player it draws in a
   notebook: the audio, the hits as bricks or as sheet music, the chords. Nothing comes
   back from the server for this: the cell is parsed and rendered here.

   Outside a host, ?src=<cell> draws the cell straight away, for a look in a browser. */
import { App } from "@modelcontextprotocol/ext-apps"
import { renderCell } from "../../dsl/js/widget/render.js"
import { notebookUrl, openUrl } from "../../dsl/js/links.js"
import widgetCss from "../../dsl/js/widget/widget.css?inline"
import themeCss from "./theme.css?inline"

const SITE = window.COMPOSER_NB_SITE || "https://composer-nb.vercel.app"

const style = document.createElement("style")
style.textContent = widgetCss + "\n" + themeCss
document.head.append(style)

const $ = (id) => document.getElementById(id)
const status = (text) => {
  $("status").textContent = text
  $("status").hidden = !text
}

let disposers = []
let shown = null // what is drawn now, so the result's repeat of the input doesn't redraw

function clear() {
  for (const d of disposers) d()
  disposers = []
  $("cells").replaceChildren()
}

// One player per music cell, each continuing from the cells before it.
function draw(sources, link) {
  const key = JSON.stringify(sources)
  if (key === shown) return
  shown = key
  clear()
  const chain = []
  for (const source of sources) {
    chain.push(source)
    const host = document.createElement("div")
    host.className = "cnb-host"
    $("cells").append(host)
    disposers.push(renderCell(host, { sources: [...chain], name: "", after: "" }))
  }
  $("open").href = link
  $("foot").hidden = false
  status("")
}

// The tool's arguments: parse and link take a cell (and what it continues from), link
// takes a notebook of cells instead.
function show(args) {
  if (!args) return
  if (Array.isArray(args.cells) && args.cells.length) {
    const music = args.cells.filter((c) => c && c.type !== "text" && typeof c.source === "string")
    if (music.length)
      draw(
        music.map((c) => c.source),
        notebookUrl(SITE, args.cells),
      )
    return
  }
  if (typeof args.source !== "string") return
  const sources =
    typeof args.after === "string" && args.after.trim() ? [args.after, args.source] : [args.source]
  draw(sources, openUrl(SITE, args.source))
}

function applyTheme(context) {
  const theme = context?.theme
  if (theme === "dark" || theme === "light") document.documentElement.dataset.theme = theme
}

// The handshake with the host, which then sends the tool's input and result.
async function connect() {
  const app = new App({ name: "composer-nb", version: __VERSION__ }, {}, { autoResize: true })
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
    status(`The player couldn't reach its host: ${err?.message || err}`)
  }
}

const query = new URLSearchParams(window.location.search)
if (query.has("src")) show({ source: query.get("src"), after: query.get("after") || undefined })
else connect()
