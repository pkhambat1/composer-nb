import { registerAppTool } from "@modelcontextprotocol/ext-apps/server"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { initialState, parseCell } from "composer-nb/language"
import { z } from "zod"
import { NOTEBOOK_UI } from "./app.ts"
import {
  notebookSchema,
  notebookCellSchema,
  type DocumentCell,
  type NotebookDocument,
} from "./notebook-document.ts"

export type SaveOptions = { validate?: boolean }
export interface NotebookRepository {
  read(): NotebookDocument
  save(cells: DocumentCell[], expectedRevision: number, options?: SaveOptions): NotebookDocument
}

export function changedNotebook(
  current: NotebookDocument,
  cells: DocumentCell[],
  expectedRevision: number,
  options: SaveOptions = {},
): NotebookDocument {
  if (expectedRevision !== current.revision)
    throw new Error(
      "The notebook changed. Read it again before saving; your edits have not been applied.",
    )
  if (new Set(cells.map((cell) => cell.id)).size !== cells.length)
    throw new Error("Cell IDs must be unique.")
  if (options.validate !== false) {
    let state = initialState()
    for (const cell of cells) {
      if (cell.type !== "music") continue
      const parsed = parseCell(cell.source, state)
      if (parsed.errors.length)
        throw new Error(
          `Cell ${cell.id}: ${parsed.errors.map((error) => `line ${error.line}: ${error.msg}`).join("\n")}`,
        )
      state = parsed.state
    }
  }
  return { ...current, revision: current.revision + 1, cells: structuredClone(cells) }
}

/** An injected in-memory repository for embedding or tests. No sample content is seeded. */
export class NotebookStore implements NotebookRepository {
  private document: NotebookDocument
  constructor(
    document: NotebookDocument = {
      id: crypto.randomUUID(),
      title: "Notebook",
      revision: 0,
      cells: [],
    },
  ) {
    this.document = structuredClone(document)
  }
  read(): NotebookDocument {
    return structuredClone(this.document)
  }
  save(cells: DocumentCell[], expectedRevision: number, options?: SaveOptions): NotebookDocument {
    this.document = changedNotebook(this.document, cells, expectedRevision, options)
    return this.read()
  }
}

function result(notebook: NotebookDocument): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ notebook }) }],
    structuredContent: { notebook },
  }
}
function failed(error: unknown): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
  }
}
export function registerNotebookTools(server: McpServer, store: NotebookRepository): void {
  registerAppTool(
    server,
    "open_notebook",
    {
      title: "Open composer notebook",
      description:
        "Open the editable notebook, including bricks, sheet music, chords and playback.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      outputSchema: { notebook: notebookSchema },
      _meta: {
        ui: { resourceUri: NOTEBOOK_UI },
        "openai/ui": { entrypoints: [{ type: "global" }, { type: "thread" }] },
      },
    },
    async () => result(store.read()),
  )
  registerAppTool(
    server,
    "get_notebook",
    {
      title: "Read composer notebook",
      description:
        "Read the current notebook, stable cell IDs and revision. Read before editing. Settings and definitions carry down through music cells.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      outputSchema: { notebook: notebookSchema },
      _meta: { ui: { visibility: ["app", "model"] } },
    },
    async () => result(store.read()),
  )
  registerAppTool(
    server,
    "update_music_cell",
    {
      title: "Update music cell",
      description:
        "Replace the complete source of the selected music cell. Preserve unrelated lines and cells. Use the cell ID and revision from get_notebook. The whole notebook is checked before saving.",
      outputSchema: { notebook: notebookSchema },
      inputSchema: {
        cellId: z.string(),
        source: z.string(),
        expectedRevision: z.number().int().nonnegative(),
      },
      _meta: { ui: { resourceUri: NOTEBOOK_UI } },
    },
    async ({ cellId, source, expectedRevision }) => {
      try {
        const document = store.read()
        const cell = document.cells.find((item) => item.id === cellId)
        if (!cell || cell.type !== "music") throw new Error(`Unknown music cell: ${cellId}`)
        return result(
          store.save(
            document.cells.map((item) => (item.id === cellId ? { ...item, source } : item)),
            expectedRevision,
          ),
        )
      } catch (error) {
        return failed(error)
      }
    },
  )
  registerAppTool(
    server,
    "save_notebook",
    {
      title: "Save notebook edits",
      description:
        "Save the editor's complete cell order and source with revision checking, including unfinished drafts.",
      outputSchema: { notebook: notebookSchema },
      inputSchema: {
        cells: z.array(notebookCellSchema),
        expectedRevision: z.number().int().nonnegative(),
      },
      _meta: { ui: { visibility: ["app"] } },
    },
    async ({ cells, expectedRevision }) => {
      try {
        return result(store.save(cells, expectedRevision, { validate: false }))
      } catch (error) {
        return failed(error)
      }
    },
  )
  registerAppTool(
    server,
    "add_music_cell",
    {
      title: "Add music cell",
      description: "Append an empty music cell for the user to select and request a groove in.",
      outputSchema: { notebook: notebookSchema },
      inputSchema: { expectedRevision: z.number().int().nonnegative() },
      _meta: { ui: { resourceUri: NOTEBOOK_UI } },
    },
    async ({ expectedRevision }) => {
      try {
        return result(
          store.save(
            [...store.read().cells, { id: crypto.randomUUID(), type: "music", source: "" }],
            expectedRevision,
          ),
        )
      } catch (error) {
        return failed(error)
      }
    },
  )
}
