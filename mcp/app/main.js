/* The MCP App: the cell, drawn inside a conversation by a host that renders MCP Apps
   (claude.ai, Claude Desktop). The host hands over the tool's input, the cell's source and
   the cells it continues from, and each cell shows as the playground shows it: the code in
   an editor, and under it the player the library draws in a notebook (the audio, the hits
   as bricks or as sheet music, the chords). The code can be changed here and played again
   with Play or Shift+Enter: the cell is parsed and rendered in this page, with nothing
   asked of the server. What was played is passed back as context for Claude's next turn.

   Outside a host, ?src=<cell> draws the cell straight away, for a look in a browser. */
import { App } from "@modelcontextprotocol/ext-apps"
import { renderCell } from "../../dsl/js/widget/render.js"
import { parseChain } from "../../dsl/js/music-engine.js"
import { highlightMusic } from "../../dsl/js/highlight.js"
import { editKey } from "../../dsl/js/editing.js"
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

function h(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

let app = null // the host, once connected
let cells = [] // the music cells drawn, in order
let notebook = null // a notebook's cells, text and music, when link was given one
let shown = null // what is drawn now, so the result's repeat of the input doesn't redraw
let edited = false // whether anything played differs from what Claude wrote

function clear() {
  for (const cell of cells) {
    cell.stop?.()
    cell.watch.disconnect()
  }
  cells = []
  $("cells").replaceChildren()
}

// The code layer under the textarea, painted token by token, with the lines the last run
// reported tinted until the code changes.
function paint(cell) {
  const { code, ta, errorLines } = cell
  code.replaceChildren()
  highlightMusic(ta.value).forEach((parts, i) => {
    if (i) code.append("\n")
    const line = errorLines.has(i + 1) ? h("span", "cell-error-line") : code
    for (const p of parts) line.append(p.c ? h("span", p.c, p.s) : p.s)
    if (line !== code) code.append(line)
  })
  code.append("\n")
  ta.style.height = "auto"
  ta.style.height = ta.scrollHeight + 2 + "px"
}

// Parses and renders cell i after the cells above it, and plays it when asked.
function run(i, play) {
  const cell = cells[i]
  const chain = cells.slice(0, i + 1).map((c) => c.ta.value)
  cell.stop?.()
  cell.stop = renderCell(cell.host, { sources: chain, name: "", after: "", play })
  cell.errorLines = new Set(
    parseChain(chain)
      .errors.map((e) => e.line)
      .filter(Boolean),
  )
  cell.played = cell.ta.value
  paint(cell)
  relink()
  if (cell.played !== cell.source) edited = true
  if (edited) tellClaude()
}

// The link under the cells opens the playground on what was last played.
function relink() {
  if (notebook) {
    let m = 0
    const nb = notebook.map((c) => (isMusic(c) ? { ...c, source: cells[m++].played } : c))
    $("open").href = notebookUrl(SITE, nb)
  } else $("open").href = openUrl(SITE, cells[cells.length - 1].played)
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

// A cell: its code in an editor, with Play at the top as in the playground, and its player.
function addCell(source) {
  const i = cells.length
  const box = h("div", "cell")
  const editor = h("div", "cell-editor")
  const code = h("pre", "cell-code")
  code.setAttribute("aria-hidden", "true")
  const ta = h("textarea", "cell-input")
  ta.value = source
  ta.spellcheck = false
  ta.setAttribute("aria-label", "The cell's code")
  const play = h("button", "cell-play", "Play")
  play.type = "button"
  play.title = "Play this cell (Shift+Enter)"
  editor.append(code, ta, play)
  const host = h("div", "cnb-host")
  box.append(editor, host)
  $("cells").append(box)

  const cell = { source, played: source, ta, code, host, errorLines: new Set() }
  cells.push(cell)
  const changed = (value) => {
    if (value != null) ta.value = value
    cell.errorLines = new Set()
    paint(cell)
  }
  ta.addEventListener("input", () => changed())
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault()
      run(i, true)
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      run(i, false)
    } else editKey(e, ta, changed)
  })
  play.addEventListener("click", () => run(i, true))
  // Wrapped lines move when the width changes, and so does the height the code needs
  let width = 0
  cell.watch = new ResizeObserver(() => {
    if (editor.clientWidth === width) return
    width = editor.clientWidth
    paint(cell)
  })
  cell.watch.observe(editor)
}

const isMusic = (c) => c && c.type !== "text" && typeof c.source === "string"

// One cell per music cell, each continuing from the cells before it.
function draw(sources, nb = null) {
  const key = JSON.stringify(sources)
  if (key === shown) return
  shown = key
  clear()
  notebook = nb
  for (const source of sources) addCell(source)
  cells.forEach((_, i) => run(i, false))
  $("foot").hidden = false
  status("")
}

// The tool's arguments: parse and link take a cell (and what it continues from), link
// takes a notebook of cells instead.
function show(args) {
  if (!args) return
  if (Array.isArray(args.cells) && args.cells.length) {
    const music = args.cells.filter(isMusic)
    if (music.length)
      draw(
        music.map((c) => c.source),
        args.cells,
      )
    return
  }
  if (typeof args.source !== "string") return
  const sources =
    typeof args.after === "string" && args.after.trim() ? [args.after, args.source] : [args.source]
  draw(sources)
}

function applyTheme(context) {
  const theme = context?.theme
  if (theme === "dark" || theme === "light") document.documentElement.dataset.theme = theme
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

const query = new URLSearchParams(window.location.search)
if (query.has("src")) show({ source: query.get("src"), after: query.get("after") || undefined })
else connect()
