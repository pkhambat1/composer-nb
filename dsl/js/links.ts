/* The playground's addresses: a link that opens it on a cell or a notebook, ready to play.
   Pure, so the playground's Share buttons and the MCP server make the same links. `site` is
   the playground's origin, https://composer-nb.vercel.app.

   Open mode: the whole playground opened on shared content, which starts playing as soon
   as it loads when the browser allows it. The address is
     <site>/?open#src=<one cell's source, URI-encoded>
     <site>/?open#nb=<the notebook's cells as JSON, base64url-encoded>
   Embed mode, the playground as a single cell in a frame, is the docs site's own
   (playground/src/shared/embed.js). */

export const SITE = "https://composer-nb.vercel.app"
// A notebook's cell, as a link carries it
export type Cell = { type: string; source: string }
export const THEMES = ["light", "dark"]

// A link that opens the playground on one cell.
export function openUrl(site: string, source: string): string {
  return `${site}/?open#src=${encodeURIComponent(source)}`
}

// A link that opens the playground on a whole notebook: cells of { type, source }.
export function notebookUrl(site: string, cells: Cell[]): string {
  const json = JSON.stringify(cells.map((c) => ({ type: c.type, source: c.source })))
  return `${site}/?open#nb=${toBase64Url(json)}`
}

// The cells a notebook link holds, or null when it doesn't hold any.
export function cellsOf(nb: string): Cell[] | null {
  try {
    const cells = JSON.parse(fromBase64Url(nb))
    if (Array.isArray(cells) && cells.every((c: Cell) => typeof c.source === "string")) {
      return cells.map((c: Cell) => ({
        type: c.type === "text" ? "text" : "music",
        source: c.source,
      }))
    }
  } catch {
    return null
  }
  return null
}

export function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function fromBase64Url(text: string): string {
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}
