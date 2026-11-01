# composer-nb MCP App

The MCP server checks and renders music and can open an editable notebook inside an
MCP Apps host. The website and embedded app share cells, bricks, sheet music, chord
diagrams, editing and audio playback through `playground/src/notebook`.

## Run from this checkout

Use Node 22.18 or later. From the repository root:

```sh
npm ci
npm run build
npm run mcp -- --http 4179 --notebook /absolute/path/to/song.json
```

The endpoint is `http://localhost:4179/mcp`. The explicit notebook file is created
empty if missing. Edits survive restarting the server. Revision checks reject stale
writes; editor drafts are saved even while their music is incomplete. Model edits
are validated against inherited settings and definitions before saving.

Omit `--http 4179` for stdio. Omit `--notebook` for the stateless music tools alone.
The package is not published on npm. The public deployment must be rebuilt and
available before using a published connector URL.

For a remote host such as ChatGPT, expose the HTTP endpoint through an HTTPS service
you control. Set `COMPOSER_NB_APP_ORIGIN=https://your-server.example` before starting
this server so it serves the renderer at `/app.js` from that same origin. Without an
asset origin, the UI resource contains the complete bundle for stdio hosts.
`COMPOSER_NB_SITE` sets the website used by music download and library links.

This local file-backed server is for one notebook owner. A hosted service should
supply an authenticated, owner-scoped `NotebookRepository`; do not share one store
between unrelated accounts.

## Interaction

1. Invoke `open_notebook` in the host.
2. Select a cell, source lines, drum brick, sheet or chord in the notebook.
3. Use the host's native chat composer, for example “Make a drum groove in this cell.”
4. The app shares the stable cell ID, selected target and current source through
   MCP Apps `updateModelContext`. Brick context includes the grid resolution and exact
   tick position, so compressed grids cannot be mistaken for source steps. The model
   reads the revision and calls
   `update_music_cell`. The open notebook refreshes the saved result.

The product contains no chat composer, model credentials or agent loop. Hosts
control where an app appears and whether native context attachments are shown.
The protocol and UI bridge are standard MCP Apps; an ordinary MCP client can still
use the tools without displaying the app. ChatGPT and Claude have both been exercised
directly in Chrome, including native selection, saved model edits, notation and
advancing audio playback. See `VERIFICATION.md` for the exact checks and remaining
host launch/retry limitations.

| Tool                | Purpose                                                   |
| ------------------- | --------------------------------------------------------- |
| `open_notebook`     | Open the notebook app and read the document               |
| `get_notebook`      | Read stable cell IDs, sources and revision                |
| `update_music_cell` | Validate and replace one cell at an expected revision     |
| `add_music_cell`    | Append an empty cell                                      |
| `save_notebook`     | App-only editor autosave, including drafts and cell order |
| `parse`             | Check a cell and display its music UI                     |
| `render`            | Export sheet PNG, MIDI or ABC notation                    |
| `library`           | Search the groove library                                 |
| `reference`         | Read the current language reference                       |

Declarations require explicit types: `pattern groove = { kick: x- }` repeats;
`block accent = { crash: 1 }` plays once. A play duration follows its music:
`play groove for 2 bars`. Untyped declarations and prefix play durations are rejected.

## Development host

With the MCP server running on port 4179:

```sh
npm run build:app -w mcp
npm run dev:app -w mcp -- --host 127.0.0.1 --port 4178 --strictPort
```

Open `http://localhost:4178/`. `app/dev/` contains a development-only host using the
real MCP client, AppBridge, iframe handshake and server tools. Its clearly labeled
fixed example edit substitutes for a model; its prompt controls are outside the
product iframe and excluded from production bundles. Rebuild the app after UI edits
because this host loads the server's production resource.

`app/NotebookApp.tsx` owns document synchronization and model context.
`app/main.ts` connects the SDK. `app/bootstrap.ts` completes the host handshake before
loading the renderer. Neither adapter duplicates the shared notebook UI.
`npm run build -w mcp` builds the generated reference, server and both UI bundles;
packaging includes `app/dist`. Tests exercise parsing, transport, persistence,
revision conflicts and UI selection stability.

## Embedding a backend

```ts
import { createServer, FileNotebookStore } from "composer-nb-mcp"

const server = createServer({ notebook: new FileNotebookStore("/path/to/song.json") })
// Connect server to the desired MCP transport.
```

For hosted storage, implement the exported `NotebookRepository` interface and pass
it to `createServer({ notebook })` or `handleMcp(req, res, { notebook })`.
