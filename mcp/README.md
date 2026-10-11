# composer-nb-mcp

The [composer-nb](https://github.com/pkhambat1/composer-nb) language as an [MCP](https://modelcontextprotocol.io) server: an assistant writes drums, notes and chords as a text cell, checks it against the parser, draws the sheet music, writes a MIDI file and hands over a link that plays.

## Connect it

**Claude.ai and Claude Desktop:** Settings → Connectors → Add custom connector, with the URL `https://composer-nb.vercel.app/mcp`.

**Claude Code:**

```bash
claude mcp add --transport http composer-nb https://composer-nb.vercel.app/mcp
```

**Cursor, Windsurf, VS Code and the rest** take the same URL as a remote server, or run it on your machine with Node 20 or later:

```json
{
  "mcpServers": {
    "composer-nb": {
      "command": "npx",
      "args": ["-y", "composer-nb-mcp"]
    }
  }
}
```

`composer-nb-mcp --http 3333` serves it over HTTP at `localhost:3333/mcp` instead. `COMPOSER_NB_SITE` sets the playground the links open.

## Tools

| Tool | Does |
| --- | --- |
| `parse` | Checks a cell: the errors with their line numbers, the settings and names in effect, and for each play a grid of every hit and note, bar by bar, with the chords it heard. |
| `render` | The sheet music as a PNG, a MIDI file, or the ABC notation. |
| `link` | A link that opens the playground on the cell, playing, and an iframe to put it on a page. With a list of cells, a link to a whole notebook. |
| `library` | Searches the grooves: transcriptions and rudiments to start from. |
| `reference` | The language reference, page by page. |

The reference pages and the grooves are resources too.

## In a page of your own

```js
import { createServer } from "composer-nb-mcp"
import { handleMcp } from "composer-nb-mcp/http"
```

`createServer({ site })` is the server for any transport; `handleMcp(req, res, { site })` answers one HTTP request with no session, as a serverless function does.
