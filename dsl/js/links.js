/* The playground's addresses: a link that opens it on a cell or a notebook, playing, and
   an iframe that shows one cell. Pure, so the playground's Share buttons and the MCP server
   make the same links. `site` is the playground's origin, https://composer-nb.vercel.app.

   Open mode: the whole playground opened on shared content, which plays as soon as it
   loads. The address is
     <site>/?open#src=<one cell's source, URI-encoded>
     <site>/?open#nb=<the notebook's cells as JSON, base64url-encoded>
   Embed mode: the playground as a single cell in a frame, which is how the docs site shows
   an example you can edit and play. The address is
     <site>/?embed#src=<the cell's source, URI-encoded>&theme=dark
   where theme is optional. */

export const SITE = "https://composer-nb.vercel.app"
export const THEMES = ["light", "dark"]

// A link that opens the playground on one cell.
export function openUrl(site, source) {
  return `${site}/?open#src=${encodeURIComponent(source)}`
}

// A link that opens the playground on a whole notebook: cells of { type, source }.
export function notebookUrl(site, cells) {
  const json = JSON.stringify(cells.map((c) => ({ type: c.type, source: c.source })))
  return `${site}/?open#nb=${toBase64Url(json)}`
}

// The address of one cell in a frame.
export function embedUrl(site, source, theme = "light") {
  return `${site}/?embed#src=${encodeURIComponent(source)}&theme=${theme}`
}

// An iframe that shows one cell, for a page of your own.
export function embedSnippet(site, source, theme = "light") {
  return `<iframe src="${embedUrl(site, source, theme)}" style="width: 100%; height: 420px; border: 0; border-radius: 6px" loading="lazy"></iframe>`
}

// The cells a notebook link holds, or null when it doesn't hold any.
export function cellsOf(nb) {
  try {
    const cells = JSON.parse(fromBase64Url(nb))
    if (Array.isArray(cells) && cells.every((c) => typeof c.source === "string")) {
      return cells.map((c) => ({ type: c.type === "text" ? "text" : "music", source: c.source }))
    }
  } catch {
    return null
  }
  return null
}

export function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text)
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function fromBase64Url(text) {
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}
