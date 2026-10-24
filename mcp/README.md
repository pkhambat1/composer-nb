# composer-nb-mcp

The [composer-nb](https://github.com/pkhambat1/composer-nb) language as an [MCP](https://modelcontextprotocol.io) server: an assistant writes drums, notes and chords as a text cell, checks it against the parser, draws the sheet music, writes a MIDI file and hands over a link that plays.

## Connect it

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

## The player, in the conversation

Where the client renders [MCP Apps](https://claude.com/docs/connectors/building/mcp-apps/getting-started) (claude.ai and Claude Desktop do), `parse` and `link` draw the player under their result: the audio with its Play button, the hits as bricks or as sheet music, and the chords, as the playground draws them. The client asks once whether to show it. A client that doesn't render apps, Claude Code among them, reads the same text as before.

The view is `app/main.js`, the library's own player with the MCP Apps client, built into `app/dist/app.js` by `npm run build:app -w mcp` and served inline in one page as the resource `ui://composer-nb/cell`. The page fetches its sounds from the same hosts as the playground, which its policy names. `npm run dev:app -w mcp` serves it at `localhost:5184/?src=<a cell>` for a look outside a host; the handshake needs a host, so the tool's input is read from the address there.

## In a page of your own

```js
import { createServer } from "composer-nb-mcp"
import { handleMcp } from "composer-nb-mcp/http"
```

`createServer({ site })` is the server for any transport; `handleMcp(req, res, { site })` answers one HTTP request with no session, as a serverless function does.
