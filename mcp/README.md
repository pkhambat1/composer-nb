# composer-nb-mcp

The [composer-nb](https://github.com/pkhambat1/composer-nb) language as an [MCP](https://modelcontextprotocol.io) server: an assistant writes drums, notes and chords as a text cell, checks it against the parser, draws the sheet music, writes a MIDI file and hands over a link that plays.

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

This package is not on npm. To run it from a checkout, `npm run mcp` serves it over stdio and `npm run mcp -- --http 3333` serves it at `localhost:3333/mcp`. `COMPOSER_NB_SITE` sets the playground the links open.

## Tools

| Tool        | Does                                                                                                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parse`     | Checks a cell: the errors with their line numbers, the settings and names in effect, and for each play a grid of every hit and note, bar by bar, with the chords it heard. |
| `render`    | The sheet music as a PNG, a MIDI file, or the ABC notation.                                                                                                                |
| `link`      | A link that opens the playground on the cell, ready to play. With a list of cells, a link to a whole notebook.                                                             |
| `library`   | Searches the grooves: transcriptions and rudiments to start from.                                                                                                          |
| `reference` | The language reference, page by page.                                                                                                                                      |

The reference pages and the grooves are resources too.

## The cell, in the conversation

Where the client renders [MCP Apps](https://claude.com/docs/connectors/building/mcp-apps/getting-started) (claude.ai and Claude Desktop do), `parse` and `link` draw the playground's own cell under their result, in a frame of its embed view: the code in its editor, the player with the practice controls (tempo, Loop, Ramp, Count-in, Mute), WAV and MIDI, the hits as bricks or as sheet music, and the chords. The code can be changed there: Play or Shift+Enter renders it and plays it. A cell continues from the cells above it, as they were last played. `parse` with an empty source draws an empty cell with the playground's prompt, for the user to write in. Once the user has changed a cell and played it, the view passes what it now reads to the client as context for the next message. The client asks once whether to show the view. A client that doesn't render apps, Claude Code among them, reads the same text as before.

The view is `app/main.js`, the page around the frames, with the MCP Apps client: it opens a frame per cell at the playground's `/?embed#src=…&after=…&run=1`, sizes it from its `composer-nb:height` messages, gives it the host's theme and the cells above (`composer-nb:theme`, `composer-nb:after`), and hears what it plays (`composer-nb:ran`). It is built into `app/dist/app.js` by `npm run build:app -w mcp` and served inline in one page as the resource `ui://composer-nb/cell`, whose policy allows frames from the playground's address (`frameDomains`). `npm run dev:app -w mcp` serves it at `localhost:5184/?src=<a cell>` for a look outside a host, and `&site=http://localhost:5173` frames a local playground; the handshake needs a host, so the tool's input is read from the address there.

## In a page of your own

```js
import { createServer } from "composer-nb-mcp"
import { handleMcp } from "composer-nb-mcp/http"
```

`createServer({ site })` is the server for any transport; `handleMcp(req, res, { site })` answers one HTTP request with no session, as a serverless function does.
