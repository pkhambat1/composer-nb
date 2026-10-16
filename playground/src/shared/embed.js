/* The playground's links: what a shared or embedded address opens on, and how to make one.
   The addresses themselves are the library's (composer-nb/links), so the MCP server makes
   the same ones.

   Embed mode: the playground as a single cell in a frame, which is how the docs site shows
   an example you can edit and play (/?embed#src=...&theme=dark). The frame tells its parent
   how tall it is, so the parent can size it (composer-nb:height), and follows the parent's
   theme when the parent says it changed (composer-nb:theme).

   Open mode: the whole playground opened on shared content, which plays as soon as it
   loads (/?open#src=... or /?open#nb=...). The Share buttons make these. */
import {
  THEMES,
  cellsOf,
  embedSnippet as snippet,
  notebookUrl,
  openUrl,
} from "composer-nb/links"

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

// An iframe that shows one cell, for a page of your own.
export function embedSnippet(source, theme = "light") {
  return snippet(site(), source, theme)
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
