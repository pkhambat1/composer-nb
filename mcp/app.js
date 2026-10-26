/* The MCP App: for a host that renders MCP Apps (claude.ai, Claude Desktop), parse and
   link draw the cell inside the conversation as the playground's own embed view, in a
   frame: the code, which the user can change and play again, and the playground's player.
   The view around the frame is app/main.js, built by Vite into app/dist/app.js (npm run
   build:app -w mcp) and put inline in one HTML page here, which the host loads in a
   sandboxed frame. A host that doesn't render UI reads the tools' text as before: the
   page is only fetched by a host that asks for it. */
import { readFile } from "node:fs/promises"
import { RESOURCE_MIME_TYPE, registerAppResource } from "@modelcontextprotocol/ext-apps/server"

export const CELL_UI = "ui://composer-nb/cell"

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

// The page the host renders, with the playground it frames.
export async function cellHtml(site) {
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
<script>window.COMPOSER_NB_SITE = ${JSON.stringify(site)}</script>
<script type="module">${js}</script>
</body>
</html>
`
}

// Registers the page as the resource parse and link name in their _meta.ui.resourceUri.
export function registerCellApp(server, { site }) {
  registerAppResource(
    server,
    "The cell, played",
    CELL_UI,
    {
      description:
        "A cell inside the conversation, as the playground draws it: its code, which the user can change and play again, its player and its practice controls.",
      mimeType: RESOURCE_MIME_TYPE,
    },
    async () => ({
      contents: [
        {
          uri: CELL_UI,
          mimeType: RESOURCE_MIME_TYPE,
          text: await cellHtml(site),
          _meta: { ui: { csp: { frameDomains: [site] }, prefersBorder: true } },
        },
      ],
    }),
  )
}
