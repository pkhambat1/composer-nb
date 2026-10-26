/* The playground's links: what a shared or embedded address opens on, and how to make one.
   The addresses themselves are the library's (composer-nb/links), so the MCP server makes
   the same ones.

   Embed mode: the playground as a single cell in a frame, which is how the docs site shows
   an example you can edit and play (/?embed#src=...&theme=dark), and how the MCP App shows
   a cell inside Claude. The frame tells its parent how tall it is, so the parent can size
   it (composer-nb:height), follows the parent's theme when the parent says it changed
   (composer-nb:theme), and tells the parent the source of each run (composer-nb:ran).
   &after=... is the source of the cells the cell continues from, which the parent can
   change later (composer-nb:after), and &run=1 renders the cell as the frame opens.

   Open mode: the whole playground opened on shared content, which starts playing as soon
   as it loads when the browser allows it (/?open#src=... or /?open#nb=...). The Share
   buttons make these. */
import { THEMES, cellsOf, notebookUrl, openUrl } from "composer-nb/links"

const query = new URLSearchParams(window.location.search)
const hash = new URLSearchParams(window.location.hash.slice(1))

export const EMBED = query.has("embed")
export const OPEN = !EMBED && query.has("open")

// The cell or notebook a link holds is read when the page loads, so a new link opened in
// the same tab (the address bar, a link on a page) loads the page again
if (EMBED || OPEN) window.addEventListener("hashchange", () => window.location.reload())

// Takes a shared link off the address once its notebook is kept, closed or left, so
// reloading the page opens the notebook that's open, not the link again
export function leaveLink() {
  if (OPEN && window.location.hash) window.history.replaceState(null, "", window.location.pathname)
}

// The cell the frame opens with.
export function embedCell() {
  return { type: "music", source: hash.get("src") || "" }
}

// Whether the frame renders its cell as soon as it opens, without playing it.
export const EMBED_RENDERS = EMBED && hash.get("run") === "1"

// The source of the cells the frame's cell continues from, for their settings and names.
let after = hash.get("after") || ""
export const embedAfter = () => after

export function embedTheme() {
  const theme = hash.get("theme")
  return THEMES.includes(theme) ? theme : "light"
}

// The cells a shared link opens with, or null when the address holds none.
export function openedCells() {
  if (!OPEN) return null
  const nb = hash.get("nb")
  if (nb) return cellsOf(nb)
  const src = hash.get("src")
  return src ? [{ type: "music", source: src }] : null
}

const site = () => window.location.origin + window.location.pathname.replace(/\/$/, "")

// A link that opens the playground on one cell.
export function shareCellUrl(source) {
  return openUrl(site(), source)
}

// A link that opens the playground on a whole notebook.
export function shareNotebookUrl(cells) {
  return notebookUrl(site(), cells)
}

// Tells the parent page how tall `el` is, now and whenever that changes.
export function reportHeight(el) {
  const send = () => {
    const height = Math.ceil(el.getBoundingClientRect().height)
    window.parent.postMessage({ type: "composer-nb:height", height }, "*")
  }
  const observer = new ResizeObserver(send)
  observer.observe(el)
  send()
  return () => observer.disconnect()
}

// Calls `onTheme` when the parent page switches between light and dark.
export function listenForTheme(onTheme) {
  const onMessage = (e) => {
    if (e.source !== window.parent || e.data?.type !== "composer-nb:theme") return
    if (THEMES.includes(e.data.theme)) onTheme(e.data.theme)
  }
  window.addEventListener("message", onMessage)
  return () => window.removeEventListener("message", onMessage)
}

// Takes a new source for the cells above when the parent page says it changed.
export function listenForAfter() {
  const onMessage = (e) => {
    if (e.source !== window.parent || e.data?.type !== "composer-nb:after") return
    if (typeof e.data.after === "string") after = e.data.after
  }
  window.addEventListener("message", onMessage)
  return () => window.removeEventListener("message", onMessage)
}

// Tells the parent page what the cell is each time it runs, so the page can pass it on.
export function reportRun(source) {
  if (EMBED) window.parent.postMessage({ type: "composer-nb:ran", source }, "*")
}
