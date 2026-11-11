/* Shared notebook UI resources for MCP Apps hosts. Tools also return useful text
   to clients without a UI. With an asset origin (COMPOSER_NB_APP_ORIGIN) the UI is an
   inline handshake plus the renderer asset; without one it carries the full built
   renderer. See mcp/README.md. */
import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { RESOURCE_MIME_TYPE, registerAppResource } from "@modelcontextprotocol/ext-apps/server"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

export const CELL_UI = "ui://composer-nb/cell"
export const NOTEBOOK_UI = "ui://composer-nb/notebook"

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
const ASSET_ORIGIN = process.env.COMPOSER_NB_APP_ORIGIN
  ? new URL(process.env.COMPOSER_NB_APP_ORIGIN).origin
  : null

let scriptLoading: Promise<string> | null = null
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

let appVersionLoading: Promise<string> | null = null
function appVersion(): Promise<string> {
  if (!appVersionLoading) {
    appVersionLoading = script()
      .then((source) => createHash("sha256").update(source).digest("hex").slice(0, 12))
      .catch((err: unknown) => {
        appVersionLoading = null
        throw err
      })
  }
  return appVersionLoading
}

// The page the host renders.
export async function cellHtml(): Promise<string> {
  const assetUrl = ASSET_ORIGIN
    ? `${ASSET_ORIGIN}/app.js?v=${await appVersion()}`
    : null
  // Inline JS must not close its own tag; "<\/" is the same string to JavaScript.
  const scriptTag = ASSET_ORIGIN
    ? `<script type="module">${(await readFile(new URL("../app/dist/bootstrap.js", import.meta.url), "utf8")).replace(/<\/script/gi, "<\\/script")}</script>`
    : `<script type="module">${(await script()).replace(/<\/script/gi, "<\\/script")}</script>`
  return `<!doctype html>
<html lang="en"${assetUrl ? ` data-composer-app="${assetUrl}"` : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>composer-nb</title>
<link rel="stylesheet" href="${FONTS}">
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
