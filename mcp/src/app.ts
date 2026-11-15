/* Shared notebook UI resources for MCP Apps hosts. Tools also return useful text
   to clients without a UI. With an asset origin (COMPOSER_NB_APP_ORIGIN) the UI is a
   small HTML page with cached static assets; without one it carries the full built
   renderer. See mcp/README.md. */
import { readFile } from "node:fs/promises"
import { z } from "zod"
import { RESOURCE_MIME_TYPE, registerAppResource } from "@modelcontextprotocol/ext-apps/server"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

// Hosts cache resources by URI. These versions load hosted assets from static storage.
export const CELL_UI = "ui://composer-nb/cell/v3"
export const NOTEBOOK_UI = "ui://composer-nb/notebook/v4"

// Where the player fetches its sounds: the drum kit, the sampled instruments.
export const SOUND_HOSTS = [
  "https://cdn.jsdelivr.net",
  "https://gleitz.github.io",
  "https://tonejs.github.io",
]

// The playground's fonts, IBM Plex, from Google Fonts: the stylesheet, then the files.
export const FONT_HOSTS = ["https://fonts.googleapis.com", "https://fonts.gstatic.com"]
const FONTS =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:wght@400;600&display=swap"
// Hosted resources must not return the multi-megabyte editor through a function
// on every open. Local standalone servers retain the self-contained fallback.
const assetOrigin = process.env.COMPOSER_NB_APP_ORIGIN || process.env.COMPOSER_NB_ORIGIN
const ASSET_ORIGIN = assetOrigin ? new URL(assetOrigin).origin : null

let scriptLoading: Promise<string> | null = null
let stylesLoading: Promise<string> | null = null
function styles(): Promise<string> {
  if (!stylesLoading) {
    stylesLoading = readFile(
      new URL("../app/dist/composer-nb-mcp.css", import.meta.url),
      "utf8",
    ).catch((error: unknown) => {
      stylesLoading = null
      throw error
    })
  }
  return stylesLoading
}
// The build is in app/dist/, one folder up from both src/ and lib/
function script(): Promise<string> {
  if (!scriptLoading) {
    scriptLoading = readFile(new URL("../app/dist/app.js", import.meta.url), "utf8").catch(
      (err: unknown) => {
        scriptLoading = null
        throw new Error(
          `The MCP App isn't built. Run: npm run build:app -w mcp (${err instanceof Error ? err.message : String(err)})`,
        )
      },
    )
  }
  return scriptLoading
}

const assetsSchema = z.object({
  renderer: z.string().regex(/^app\.[a-f0-9]{16}\.js$/),
  bootstrap: z.string().regex(/^bootstrap\.[a-f0-9]{16}\.js$/),
  stylesheet: z.string().regex(/^composer-nb-mcp\.[a-f0-9]{16}\.css$/),
})
let assetsLoading: Promise<z.infer<typeof assetsSchema>> | null = null
function assets() {
  if (!assetsLoading) {
    assetsLoading = readFile(new URL("../app/dist/manifest.json", import.meta.url), "utf8")
      .then((source) => assetsSchema.parse(JSON.parse(source)))
      .catch((error: unknown) => {
        assetsLoading = null
        throw error
      })
  }
  return assetsLoading
}

// The page the host renders.
export async function cellHtml(): Promise<string> {
  const published = ASSET_ORIGIN ? await assets() : null
  const base = `${ASSET_ORIGIN}/mcp-assets/`
  const assetUrl = published ? `${base}${published.renderer}` : null
  // Inline JS must not close its own tag; "<\/" is the same string to JavaScript.
  const scriptTag = published
    ? `<script type="module" src="${base}${published.bootstrap}"></script>`
    : `<script type="module">${(await script()).replace(/<\/script/gi, "<\\/script")}</script>`
  const styleTag = published
    ? `<link rel="stylesheet" data-composer-editor href="${base}${published.stylesheet}">`
    : `<style data-composer-editor>${(await styles()).replace(/<\/style/gi, "<\\/style")}</style>`
  return `<!doctype html>
<html lang="en"${assetUrl ? ` data-composer-app="${assetUrl}"` : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>composer-nb</title>
<link rel="stylesheet" href="${FONTS}">
${styleTag}
</head>
<body>
<div id="status">Loading the player…</div>
<div id="cells"></div>
${scriptTag}
</body>
</html>
`
}

// Registers the page as the resource parse names in its _meta.ui.resourceUri.
export function registerCellApp(server: McpServer): void {
  for (const resourceUri of [CELL_UI, NOTEBOOK_UI]) {
    registerAppResource(
      server,
      "The cell, played",
      resourceUri,
      {
        description:
          "The cells inside the conversation, as the playground draws them: the code, which the user can change and play again, the player, the hits as bricks or as sheet music, and the chords.",
        mimeType: RESOURCE_MIME_TYPE,
      },
      async () => {
        if (process.env.COMPOSER_DEBUG) console.error("Read UI", resourceUri)
        return {
          contents: [
            {
              uri: resourceUri,
              mimeType: RESOURCE_MIME_TYPE,
              text: await cellHtml(),
              _meta: {
                "openai/ui": {
                  availableDisplayModes:
                    resourceUri === NOTEBOOK_UI ? ["fullscreen"] : ["inline", "fullscreen"],
                },
                ui: {
                  csp: {
                    connectDomains: [...SOUND_HOSTS, "blob:"],
                    resourceDomains: [
                      ...FONT_HOSTS,
                      "blob:",
                      ...(ASSET_ORIGIN ? [ASSET_ORIGIN] : []),
                    ],
                  },
                  prefersBorder: true,
                },
              },
            },
          ],
        }
      },
    )
  }
}
