/* The MCP App: the cell, drawn inside a conversation by a host that renders MCP Apps
   (claude.ai, Claude Desktop). The host hands over the tool's input, the cell's source and
   the cells it continues from, and each cell is the playground's own, in a frame of its
   embed view (playground/src/shared/embed.js): the same editor, player and practice
   controls as the website. The frame says how tall it is and what it plays; this page
   sizes it, gives it the host's theme and the cells above it, and passes what was played
   back as context for Claude's next turn.

   Outside a host, ?src=<cell> draws the cell straight away, for a look in a browser, and
   ?site=<playground> frames another playground, such as a local one. */
import { App } from "@modelcontextprotocol/ext-apps"
import themeCss from "./theme.css?inline"

const query = new URLSearchParams(window.location.search)
const SITE = query.get("site") || window.COMPOSER_NB_SITE || "https://composer-nb.vercel.app"

const style = document.createElement("style")
style.textContent = themeCss
document.head.append(style)

const $ = (id) => document.getElementById(id)
const status = (text) => {
  $("status").textContent = text
  $("status").hidden = !text
}

let app = null // the host, once connected
let theme = "light"
let cells = [] // one per music cell: { frame, source, played }
let shown = null // what is drawn now, so the result's repeat of the input doesn't redraw
let edited = false // whether anything played differs from what Claude wrote

// The source of the cells above cell i, as they were last played.
const above = (i) =>
  cells
    .slice(0, i)
    .map((c) => c.played)
    .join("\n\n")

function frameUrl(source, after) {
  const hash = new URLSearchParams({ src: source, theme, run: "1" })
  if (after) hash.set("after", after)
  return `${SITE}/?embed#${hash}`
}

// One frame per music cell, each continuing from the cells before it.
function draw(sources) {
  const key = JSON.stringify(sources)
  if (key === shown) return
  shown = key
  cells = []
  $("cells").replaceChildren()
  sources.forEach((source, i) => {
    const frame = document.createElement("iframe")
    frame.className = "cell"
    frame.title = "composer-nb cell"
    frame.allow = "autoplay"
    // Room for the code until the frame says how tall it is
    frame.style.height = `${source.split("\n").length * 20 + 120}px`
    cells.push({ frame, source, played: source })
    frame.src = frameUrl(source, sources.slice(0, i).join("\n\n"))
    $("cells").append(frame)
  })
  status("")
}

// What the user played, for Claude to read with their next message. Nothing is sent
// until then, and each update replaces the last.
function tellClaude() {
  if (!app?.getHostCapabilities()?.updateModelContext) return
  const fence = (s) => "```composer-nb\n" + s + "\n```"
  const text =
    cells.length === 1
      ? `In the composer-nb player, the user changed the cell and played it. It now reads:\n\n${fence(cells[0].played)}`
      : `In the composer-nb player, the user changed the cells and played them. They now read, in order:\n\n${cells.map((c) => fence(c.played)).join("\n\n")}`
  app.updateModelContext({ content: [{ type: "text", text }] }).catch(() => {})
}

// What a frame says: how tall it is, and the source of each run.
window.addEventListener("message", (e) => {
  const i = cells.findIndex((c) => c.frame.contentWindow === e.source)
  if (i < 0) return
  const { type, height, source } = e.data || {}
  if (type === "composer-nb:height" && typeof height === "number" && height > 0) {
    cells[i].frame.style.height = `${height}px`
  } else if (type === "composer-nb:ran" && typeof source === "string") {
    cells[i].played = source
    // The cells below carry on from this one as it now reads
    for (let j = i + 1; j < cells.length; j++) {
      cells[j].frame.contentWindow?.postMessage({ type: "composer-nb:after", after: above(j) }, "*")
    }
    if (source !== cells[i].source) edited = true
    if (edited) tellClaude()
  }
})

const isMusic = (c) => c && c.type !== "text" && typeof c.source === "string"

// The tool's arguments: parse and link take a cell (and what it continues from), link
// takes a notebook of cells instead.
function show(args) {
  if (!args) return
  if (Array.isArray(args.cells) && args.cells.length) {
    const music = args.cells.filter(isMusic)
    if (music.length) draw(music.map((c) => c.source))
    return
  }
  if (typeof args.source !== "string") return
  const sources =
    typeof args.after === "string" && args.after.trim() ? [args.after, args.source] : [args.source]
  draw(sources)
}

function applyTheme(context) {
  const next = context?.theme
  if (next !== "dark" && next !== "light") return
  theme = next
  document.documentElement.dataset.theme = theme
  for (const c of cells)
    c.frame.contentWindow?.postMessage({ type: "composer-nb:theme", theme }, "*")
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
    status(`The player couldn't reach its host: ${err?.message || err}`)
  }
}

if (query.has("src")) show({ source: query.get("src"), after: query.get("after") || undefined })
else connect()
