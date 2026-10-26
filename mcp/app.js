/* The MCP App: for a host that renders MCP Apps (claude.ai, Claude Desktop), parse and
   link draw the cell inside the conversation: its code, which the user can change and play
   again, and the player (the audio with its Play button, the hits as bricks or as sheet
   music, the chords). The view is app/main.js, built by Vite into
   app/dist/app.js (npm run build:app -w mcp) and put inline in one HTML page here, which
   the host loads in a sandboxed frame. A host that doesn't render UI reads the tools' text
   as before: the page is only fetched by a host that asks for it. */
import { readFile } from "node:fs/promises"
import { RESOURCE_MIME_TYPE, registerAppResource } from "@modelcontextprotocol/ext-apps/server"

export const CELL_UI = "ui://composer-nb/cell"

// Where the player fetches its sounds: the drum kit, the sampled instruments.
export const SOUND_HOSTS = [
  "https://cdn.jsdelivr.net",
  "https://gleitz.github.io",
  "https://tonejs.github.io",
]

let scriptLoading = null
function script() {
  if (!scriptLoading) {
    scriptLoading = readFile(new URL("./app/dist/app.js", import.meta.url), "utf8").catch((err) => {
      scriptLoading = null
      throw new Error(`The MCP App isn't built. Run: npm run build:app -w mcp (${err.message})`)
    })
  }
  return scriptLoading
}

// The page the host renders.
export async function cellHtml() {
  // Inline JS must not close its own tag; "<\/" is the same string to JavaScript.
  const js = (await script()).replace(/<\/script/gi, "<\\/script")
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>composer-nb</title>
</head>
<body>
<div id="status">Loading the player…</div>
<div id="cells"></div>
<script type="module">${js}</script>
</body>
</html>
`
}

// Registers the page as the resource parse and link name in their _meta.ui.resourceUri.
export function registerCellApp(server) {
  registerAppResource(
    server,
    "The cell, played",
    CELL_UI,
    {
      description:
        "A cell inside the conversation: its code, which the user can change and play again, its audio, the hits as bricks or as sheet music, and the chords.",
      mimeType: RESOURCE_MIME_TYPE,
    },
    async () => ({
      contents: [
        {
          uri: CELL_UI,
          mimeType: RESOURCE_MIME_TYPE,
          text: await cellHtml(),
          _meta: { ui: { csp: { connectDomains: SOUND_HOSTS }, prefersBorder: true } },
        },
      ],
    }),
  )
}
