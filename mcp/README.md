# composer-nb-mcp

The [composer-nb](https://github.com/pkhambat1/composer-nb) language as an [MCP](https://modelcontextprotocol.io) server: an assistant writes drums, notes and chords as a text cell, checks it against the parser, draws the sheet music and writes a MIDI file.

## Install the plugin

In Claude, the [plugin](../plugin/README.md) brings this server as its connector, with skills for writing cells, grooves, practice routines and theory.

**Claude.ai and Claude Desktop:** Customize → Plugins → Add → Add marketplace, with the repository `pkhambat1/composer-nb`. Select composer-nb, then Add, and add its connector on the plugin's Connectors tab.

**Claude Code:**

```text
/plugin marketplace add pkhambat1/composer-nb
/plugin install composer-nb@composer-nb
```

## Connect it

For the server alone, or another assistant.

**Claude.ai and Claude Desktop:** Settings → Connectors → Add custom connector, with the URL `https://composer-nb.vercel.app/mcp`.

**Claude Code:**

```bash
claude mcp add --transport http composer-nb https://composer-nb.vercel.app/mcp
```

**Cursor, Windsurf, VS Code and the rest** take the same URL as a remote server.

This package is not on npm. To run it from a checkout, `npm run mcp` serves it over stdio and `npm run mcp -- --http 3333` serves it at `localhost:3333/mcp`. `COMPOSER_NB_SITE` sets the site the groove pages and the sheet and MIDI downloads are linked at.

The server is TypeScript, in `src/`. `npm run mcp` runs it as it is (Node 22.18 or later runs TypeScript), and `npm run build:lib -w mcp` compiles it into `lib/`, which the Vercel functions in `api/` run. `src/reference.ts` is written from the docs' reference pages by `npm run reference -w mcp`.

## Tools

| Tool        | Does                                                                                                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parse`     | Checks a cell: the errors with their line numbers, the settings and names in effect, and for each play a grid of every hit and note, bar by bar, with the chords it heard. |
| `render`    | The sheet music as a PNG, a MIDI file, or the ABC notation.                                                                                                                |
| `library`   | Searches the grooves: transcriptions and harmony to start from.                                                                                                          |
| `reference` | The language reference, page by page.                                                                                                                                      |

The reference pages and the grooves are resources too.

## The cell, in the conversation

Where the client renders [MCP Apps](https://claude.com/docs/connectors/building/mcp-apps/getting-started) (claude.ai and Claude Desktop do), `parse` draws the cell under its result as the playground's own: the code in its editor, the player, the hits as bricks or as sheet music, and the chords. The code can be changed there: Play or Shift+Enter renders it and plays it. A cell continues from the cells above it. `parse` with an empty source draws an empty cell with the playground's prompt, for the user to write in. Once the user has changed a cell and played it, the view passes what it now reads to the client as context for the next message. The client asks once whether to show the view. A client that doesn't render apps, Claude Code among them, reads the same text as before.

The view is `app/main.ts`: the playground's `App` (`playground/src/App.tsx`, given the cells through its `host` prop) and its styles, with the MCP Apps client, built into `app/dist/app.js` by `npm run build:app -w mcp` and served inline in one page as the resource `ui://composer-nb/cell`. Nothing is framed, since Claude shows frames only from sites it allows a connector. The page fetches its sounds and fonts from the same hosts as the playground, which its policy names. `npm run dev:app -w mcp` serves it at `localhost:5184/?src=<a cell>` for a look outside a host; the handshake needs a host, so the tool's input is read from the address there.

## In a page of your own

```js
import { createServer } from "composer-nb-mcp"
import { handleMcp } from "composer-nb-mcp/http"
```

`createServer({ site })` is the server for any transport; `handleMcp(req, res, { site })` answers one HTTP request with no session, as a serverless function does.
