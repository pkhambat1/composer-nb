# Shared notebook UI

The website, documentation iframe and MCP app use the same notebook controller, cell
list, playback and music views. Import the host-facing API from `index.ts`.

| Layer                   | Responsibility                                                    |
| ----------------------- | ----------------------------------------------------------------- |
| `NotebookEditor`        | Host-owned document, transient view preferences, typed snapshots  |
| `NotebookWorkspace`     | Shared surface with slots for a header and footer                 |
| `NotebookToolbar`       | Add cells, run all and interrupt rendering through the controller |
| `NotebookCells`         | Cell presentation, editing, drag ordering and insertion gaps      |
| `MusicViews`            | Bricks, sheet music, chord diagrams, view toggles and diagnostics |
| `useNotebookController` | Composes editing, execution, playback and keyboard behavior       |
| `useNotebookRuntime`    | Sequential rendering, inherited cell state and audio playback     |

`App.tsx` owns website persistence, navigation and notebook menus. `mcp/app/main.ts`
owns the MCP SDK connection, tool input and model context. Neither adapter should
reimplement cells or music output. Shared UI must not import an MCP SDK or website
storage. Both surfaces use `styles/app.css`; MCP CSS only adjusts the host frame.

For a host-owned notebook:

```tsx
<NotebookEditor
  key={documentRevision}
  host={{ cells, after, theme, onRun }}
  title="Practice notebook"
  onSnapshot={handleSnapshot}
/>
```

Set `single` for a tool-result cell without notebook chrome. `host.cells` is initial
document data. Replace the React key when intentionally replacing the document;
changing theme or callbacks preserves edits and playback state. `onSnapshot` reports
cell IDs, types, source and selected cell, without audio buffers or render state.
Output rendering and playback ticks do not emit duplicate snapshots. The adapter
decides when to persist edits or share selection with an assistant.

When adding a renderer or changing a view toggle, edit `MusicViews` or its renderer
in `components/`, not the host adapter. When adding a host capability, keep SDK calls
in the adapter and pass typed data or callbacks across this boundary.

Validation commands:

```sh
npm run typecheck -w playground
npm run typecheck -w mcp
npm run test -w playground
npm run test -w mcp
npm run build -w playground
```

`mcp` tests build the production app bundle first. See `mcp/README.md` for the real
MCP development host. Its mock prompt controls live in `mcp/app/dev/` and are never
part of `NotebookEditor` or the production app. A real host owns the conversation;
the adapter only publishes selection context and synchronizes saved music.

Selections include stable cell IDs, source line ranges and semantic targets for
bricks, sheets and chords. Preserve these attributes when changing a renderer so
host prompts continue to identify exactly what the user selected. Initial selected
cell state is initialized once; snapshot callbacks must not feed a prop-mirroring
effect that resets selection after each render.

The notebook resource URI is stable (`ui://composer-nb/notebook`). Keep routine UI
updates in the renderer bundle instead of inventing new resource URIs that break
saved tool-result views. The HTTP renderer is served with `Cache-Control: no-cache`.
