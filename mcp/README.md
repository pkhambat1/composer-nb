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

Omit `--notebook` for the stateless music tools alone. This local server is for
development; assistants connect to the hosted one at https://composer-nb.vercel.app/mcp
(`api/mcp.ts`), which must be deployed before a change reaches them.

For a remote host such as ChatGPT, expose the HTTP endpoint through an HTTPS service
you control. Set `COMPOSER_NB_APP_ORIGIN=https://your-server.example` before starting
this server so it serves the hashed renderer assets at `/mcp-assets/` from that
same origin. Without an asset origin, the UI resource carries the complete bundle.
`COMPOSER_NB_SITE` sets the website used by the sheet and MIDI download links.

This local file-backed server is for one notebook owner. A hosted service should
supply an authenticated, owner-scoped `NotebookRepository`; do not share one store
between unrelated accounts.

## Personal notebooks through ChatGPT

The hosted integration connects existing Composer.nb accounts to the same Supabase
notebooks used by the website. Every hosted MCP operation requires a linked
account, including parsing, rendering, tool discovery and UI resources. Requests
without a valid MCP token return HTTP 401 with OAuth discovery information.
OAuth discovery and sign-in endpoints remain accessible so users can connect.

1. Connect the `/mcp` endpoint in your host with **OAuth authentication** and dynamic
   client registration. Sign in and approve access before using any tools.
2. Ask to open your notebooks. Sign in on Composer.nb and approve the requesting
   app's notebook permissions. Google/email sign-in returns to the consent page.
3. Select a notebook in the embedded picker, or ask the assistant to find one by
   name using `list_notebooks`. Select a cell and request an edit in the host chat.
4. Edits save to the same website notebook. Every operation carries a notebook ID;
   each request resolves its owner from the verified OAuth credential. Revision
   checks protect against simultaneous website, editor and assistant changes.
5. Revoke access from the website account menu under **Connected apps**.

ChatGPT provides the model, conversation and tool orchestration. Composer.nb
provides music tools, editing, playback and persistent documents. No model API key
or second chat interface is required in Composer.nb.

Composition requests persist to notebooks. The assistant states the destination
before writing, uses the selected/named notebook or creates a descriptive new one,
and appends by default. Replacing a cell requires an edit request. Create and append
accept validated source and persist it atomically; responses confirm the notebook
and cell changed. The embedded editor explicitly says changes autosave. Hosted
`parse` is validation-only and does not display an unsaved standalone player.
Explicit no-save requests and read-only explanations do not modify notebooks.

### Deploy account linking

Apply `supabase/migrations/20261115000000_mcp_accounts.sql` to the intended Supabase
project. Set these **server-only** variables in the deployment environment:

| Variable                    | Value                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `COMPOSER_NB_ORIGIN`        | Canonical website origin, e.g. `https://composer-nb.vercel.app` (no path)                         |
| `SUPABASE_URL`              | The website's Supabase project URL                                                                |
| `SUPABASE_SERVICE_ROLE_KEY` | That project's backend service-role key; never prefix with `VITE_` or include in a plugin package |

Keep the website's existing `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`. In Supabase Auth, allow the website root,
`/oauth/consent` and `/connections` as return URLs, including consent query
parameters (for example `https://composer-nb.vercel.app/oauth/consent**`). The Google
provider still redirects to the existing Supabase Auth callback.

Deploy the website and API together using `vercel.json`. Its rewrites expose
`/authorize`, `/token`, `/register`, `/revoke`, the discovery documents and the
consent/connection endpoints. Without the server configuration the MCP endpoint
returns 503; partial configuration also fails closed. There is no anonymous hosted
MCP fallback. The migration and
local tests do not configure or deploy the production project automatically.

Hosted UI resources use `COMPOSER_NB_ORIGIN` as their default asset origin. The
Vercel build publishes content-hashed bootstrap, renderer and CSS files under
`/mcp-assets/`, with cross-origin loading and immutable browser/CDN caching. Each
`resources/read` returns only a small HTML page, rather than transferring the
multi-megabyte editor through a function on every notebook open.
`COMPOSER_NB_APP_ORIGIN` overrides the asset origin when another host serves these
files. The build writes `mcp/app/dist/manifest.json` and its matching `static/`
directory together; deploy both so cached filenames always match the resource.

The MCP SDK supplies OAuth protocol handling, client validation and S256 PKCE.
Supabase verifies website login; website session tokens never reach the MCP host.
Opaque MCP credentials are resource-bound, scoped, expiring and stored only as
SHA-256 hashes. Consent requests, codes and refresh credentials are consumed
atomically in Postgres. Refresh-token replay revokes the connection. Access tokens
last up to one hour; connections last up to 30 days and require reconnection after
that. Disconnect invalidates outstanding access immediately.

The backend uses a service-role database client. All notebook queries explicitly
filter the verified owner; saves check both owner and revision atomically in a
function callable only by the service role. The OAuth table is unavailable to
anonymous and ordinary authenticated database roles. Keep service credentials
server-side and preserve these owner checks when extending the tools.

The OAuth server advertises public clients (`token_endpoint_auth_method: none`)
with dynamic registration. Choose DCR in the host connection; CIMD and OIDC are not
advertised. Registered redirects are checked by the SDK. Copy the callback from
the host when manually registering a client; do not assume a universal callback.

The SDK includes per-instance endpoint rate limits. Before broad public rollout,
apply platform-wide limits to `/register`, `/authorize`, `/token` and the consent
endpoints. Periodically delete expired OAuth records after their expiration; do
not delete unexpired consumed refresh records, which detect replay, or registered
clients, which must survive reconnects. Client credentials and user documents
must never be logged.

Why not point the host directly at Supabase OAuth? Its currently documented
access tokens use the shared `authenticated` audience and do not bind RFC 8707
resource indicators ([upstream issue](https://github.com/supabase/auth/issues/2610)).
This integration uses separate, explicitly resource-bound credentials and the
[standard MCP OAuth contract](https://developers.openai.com/plugins/build/auth).

### Local account testing

Run `supabase start`, then `supabase migration up --local`. Export the three
server variables above, using the local project and
`COMPOSER_NB_ORIGIN=http://127.0.0.1:5173`. Run:

```sh
npm run build:app -w mcp
npm run dev:accounts -w mcp
npm run dev -w playground -- --host 127.0.0.1 --port 5173
```

The website's Vite server proxies OAuth and MCP requests to the account backend
on port 4187. Local integration tests use temporary accounts and reject non-local
Supabase URLs:

```sh
supabase status -o json > /private/tmp/composer-supabase-status.json
chmod 600 /private/tmp/composer-supabase-status.json
cd mcp
COMPOSER_TEST_SUPABASE_STATUS=/private/tmp/composer-supabase-status.json npx vitest run
```

Delete the status file after testing: it contains development credentials. Without
that variable, database integration tests are skipped; protocol and UI tests still
run. The separate `--notebook` development server continues to serve a single local
file without account linking.

### Share the plugin

`plugin/plugin.json` and `plugin/mcp.json` provide a portable package for ChatGPT
and other compatible hosts; `.claude-plugin` and `.mcp.json` remain for Claude
compatibility. Skills explain how to select saved notebooks and preserve revision
and cell IDs. See `plugin/README.md` for installation and release instructions.

Deploy and test the hosted OAuth flow with two accounts before inviting users.
A package or custom connection is separate from public directory publication;
publication requires the provider's submission/review process, accurate privacy
and support information, and a working review account. Neither publication nor a
production ChatGPT/Claude sign-in is claimed by local test results.

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
| `open_notebook`     | Open a notebook by ID or show the account notebook picker |
| `list_notebooks`    | List the connected account’s saved notebooks              |
| `create_notebook`   | Create a notebook, optionally with composed music         |
| `get_profile`       | Identify the connected account                            |
| `get_notebook`      | Read stable cell IDs, sources and revision                |
| `update_music_cell` | Validate and replace one cell at an expected revision     |
| `add_music_cell`    | Append validated music or an empty cell                   |
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

The UI resource includes `app/dist/composer-nb-mcp.css` as well as the renderer,
using cached static files when an asset origin is configured.
Vite extracts Monaco's layout styles into this file; omitting it exposes the
editor's internal textarea and breaks positioning. Both inline and external-asset
loading include these styles. UI resource URIs are versioned when their HTML contract
changes so hosts can fetch the updated resource.
