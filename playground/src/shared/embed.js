/* The playground's links: what a shared or embedded address opens on, and how to make one.

   Embed mode: the playground as a single cell in a frame, which is how the docs site shows
   an example you can edit and play. The address is
     /?embed#src=<the cell's source, URI-encoded>&theme=dark
   where theme is optional. The frame tells its parent how tall it is, so the parent can
   size it (composer-nb:height), and follows the parent's theme when the parent says it
   changed (composer-nb:theme).

   Open mode: the whole playground opened on shared content, which plays as soon as it
   loads. The address is
     /?open#src=<one cell's source, URI-encoded>
     /?open#nb=<the notebook's cells as JSON, base64url-encoded>
   The Share buttons make these. */

const THEMES = ["light", "dark"]
const query = new URLSearchParams(window.location.search)
const hash = new URLSearchParams(window.location.hash.slice(1))

export const EMBED = query.has("embed")
export const OPEN = !EMBED && query.has("open")

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
  if (nb) {
    try {
      const cells = JSON.parse(fromBase64Url(nb))
      if (Array.isArray(cells) && cells.every((c) => typeof c.source === "string")) {
        return cells.map((c) => ({ type: c.type === "text" ? "text" : "music", source: c.source }))
      }
    } catch {
      return null
    }
  }
  const src = hash.get("src")
  return src ? [{ type: "music", source: src }] : null
}

const base = () => window.location.origin + window.location.pathname

// A link that opens the playground on one cell.
export function shareCellUrl(source) {
  return `${base()}?open#src=${encodeURIComponent(source)}`
}

// A link that opens the playground on a whole notebook.
export function shareNotebookUrl(cells) {
  const json = JSON.stringify(cells.map((c) => ({ type: c.type, source: c.source })))
  return `${base()}?open#nb=${toBase64Url(json)}`
}

// An iframe that shows one cell, for a page of your own.
export function embedSnippet(source, theme = "light") {
  const url = `${base()}?embed#src=${encodeURIComponent(source)}&theme=${theme}`
  return `<iframe src="${url}" style="width: 100%; height: 420px; border: 0; border-radius: 6px" loading="lazy"></iframe>`
}

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text)
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64Url(text) {
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
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
