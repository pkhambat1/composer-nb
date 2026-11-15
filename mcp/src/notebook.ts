import { registerAppTool } from "@modelcontextprotocol/ext-apps/server"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { initialState, parseCell, type Parsed } from "composer-nb/language"
import { z } from "zod"
import { NOTEBOOK_UI } from "./app.ts"
import { describe } from "./cell.ts"
import { NotebookAuthorizationError, type NotebookWorkspace } from "./notebook-workspace.ts"
import {
  CONFLICT_META,
  NOTEBOOK_META,
  notebookSchema,
  notebookChangeSchema,
  notebookListSchema,
  notebookCellSchema,
  notebookRevisionSchema,
  notebookSummarySchema,
  type NotebookChange,
  type DocumentCell,
  type NotebookDocument,
} from "./notebook-document.ts"

export class NotebookConflictError extends Error {
  constructor() {
    super("The notebook changed. Read it again before saving; your edits have not been applied.")
  }
}
export interface NotebookRepository {
  read(): NotebookDocument
  save(cells: DocumentCell[], expectedRevision: number): NotebookDocument
  /** A new title. The cells and the revision stay as they are, as on the website. */
  rename(title: string): NotebookDocument
}

// The notebook with its cells replaced, one revision on. What the cells hold is the
// caller's to check: the app saves unfinished drafts, the assistant's tools check theirs.
export function changedNotebook(
  current: NotebookDocument,
  cells: DocumentCell[],
  expectedRevision: number,
): NotebookDocument {
  if (expectedRevision !== current.revision) throw new NotebookConflictError()
  if (new Set(cells.map((cell) => cell.id)).size !== cells.length)
    throw new Error("Cell IDs must be unique.")
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
  save(cells: DocumentCell[], expectedRevision: number): NotebookDocument {
    this.document = changedNotebook(this.document, cells, expectedRevision)
    return this.read()
  }
  rename(title: string): NotebookDocument {
    this.document = { ...this.document, title }
    return this.read()
  }
}

// Each music cell parsed in order, with what the cells above it set and name.
function parsedCells(cells: DocumentCell[]): Map<string, Parsed> {
  const out = new Map<string, Parsed>()
  let state = initialState()
  for (const cell of cells) {
    if (cell.type !== "music") continue
    const parsed = parseCell(cell.source, state)
    out.set(cell.id, parsed)
    state = parsed.state
  }
  return out
}

// Checks the one cell the assistant wrote, where it sits in `next`. Returns what parse
// would say of it, and names the cells below that it broke. Throws when it has errors,
// so nothing is saved. The other cells' own mistakes (a draft the user left) don't stop it.
function checked(before: DocumentCell[], next: DocumentCell[], cellId: string): string {
  const parsed = parsedCells(next)
  const cell = next.find((c) => c.id === cellId)
  const own = parsed.get(cellId)
  if (!cell || !own) throw new Error("Unknown music cell")
  const report = describe(own, null, cell.source)
  if (own.errors.length) throw new Error(`Not saved. ${report}`)
  const was = parsedCells(before)
  const broke = next.flatMap((c, i) => {
    const errors = parsed.get(c.id)?.errors ?? []
    if (!errors.length || was.get(c.id)?.errors.length) return []
    return [
      `Cell ${i + 1} now has errors: ${errors.map((e) => `line ${e.line}: ${e.msg}`).join("; ")}`,
    ]
  })
  return [report, ...broke].join("\n")
}

const text = (t: string) => ({ type: "text" as const, text: t })

// A write's result: the change and the cell's parse report for the assistant, the whole
// notebook for the app.
function changed(
  notebook: NotebookDocument,
  change: string,
  cellId?: string,
  report?: string,
): CallToolResult {
  const index = notebook.cells.findIndex((c) => c.id === cellId)
  const summary: NotebookChange = {
    notebookId: notebook.id,
    title: notebook.title,
    revision: notebook.revision,
    cellCount: notebook.cells.length,
    ...(index >= 0 ? { cellId, cellNumber: index + 1 } : {}),
    change,
  }
  return {
    content: [
      text(
        `${change} Notebook ID ${notebook.id}, revision ${notebook.revision}` +
          (index >= 0 ? `, cell ID ${cellId}.` : ".") +
          (report ? `\n\n${report}` : ""),
      ),
    ],
    structuredContent: summary,
    _meta: { [NOTEBOOK_META]: notebook },
  }
}
function result(value: Record<string, unknown>): CallToolResult {
  return { content: [text(JSON.stringify(value))], structuredContent: value }
}
async function respond(work: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await work()
  } catch (error) {
    return {
      isError: true,
      content: [text(error instanceof Error ? error.message : "Notebook operation failed")],
      ...(error instanceof NotebookAuthorizationError
        ? { _meta: { "mcp/www_authenticate": [error.challenge] } }
        : error instanceof NotebookConflictError
          ? { _meta: { [CONFLICT_META]: true } }
          : {}),
    }
  }
}
export function registerNotebookTools(server: McpServer, store: NotebookWorkspace): void {
  const notebookId = z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe(
      "Notebook ID from list_notebooks or the selected notebook context. Required for cloud reads and edits.",
    )
  const security = (write = false) => ({
    securitySchemes: store.cloud
      ? [
          {
            type: "oauth2",
            scopes: write ? ["notebooks:read", "notebooks:write"] : ["notebooks:read"],
          },
        ]
      : [{ type: "noauth" }],
  })
  const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  const add = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
  const edit = { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
  const source = z
    .string()
    .max(1_000_000)
    .default("")
    .describe("The cell: composer-nb source. Omit for an empty cell.")
  const revision = z.number().int().nonnegative()
  const ui = { resourceUri: NOTEBOOK_UI }
  const report = (cells: DocumentCell[], next: DocumentCell[], cellId: string, source: string) =>
    source.trim() ? checked(cells, next, cellId) : "An empty cell, for the user to write in."

  server.registerTool(
    "list_notebooks",
    {
      title: "Find your notebooks",
      description:
        "List the signed-in user's saved notebooks and stable IDs. Use nextOffset to fetch more. Select by ID before reading or editing; never assume a shared current notebook.",
      inputSchema: { offset: z.number().int().nonnegative().default(0) },
      outputSchema: notebookListSchema.shape,
      annotations: readOnly,
      _meta: security(),
    },
    ({ offset }) => respond(async () => result({ ...(await store.list(offset)) })),
  )
  registerAppTool(
    server,
    "open_notebook",
    {
      title: "Open composer notebook",
      description:
        "Show a saved notebook by ID to the user, with editing, notation and playback. Without an ID, show the notebook picker. It returns no source: read get_notebook for that. A save already shows the notebook, so don't call this after one.",
      inputSchema: { notebookId },
      // A notebook when one opens, the list when the picker does
      outputSchema: {
        ...notebookChangeSchema.partial().shape,
        ...notebookListSchema.partial().shape,
      },
      annotations: readOnly,
      _meta: {
        ...security(),
        ui,
        "openai/ui": { entrypoints: [{ type: "global" }, { type: "thread" }] },
      },
    },
    ({ notebookId }) =>
      respond(async () => {
        if (store.cloud && !notebookId) return result({ ...(await store.list()) })
        const notebook = await store.read(notebookId)
        return changed(notebook, `Opened "${notebook.title}".`)
      }),
  )
  registerAppTool(
    server,
    "create_notebook",
    {
      title: "Create notebook",
      description:
        "Create a saved notebook in the signed-in account with one music cell, and show it. The source is checked first: with errors nothing is created and the errors come back; without, the result is what parse would say of it. Say the title you are creating before calling.",
      inputSchema: { title: z.string().trim().min(1).max(200), source },
      outputSchema: notebookChangeSchema.shape,
      annotations: add,
      _meta: { ...security(true), ui },
    },
    ({ title, source }) =>
      respond(async () => {
        const draft: DocumentCell = { id: "new", type: "music", source }
        const said = report([], [draft], draft.id, source)
        const notebook = await store.create(title, source)
        return changed(
          notebook,
          `Created notebook "${notebook.title}" with one music cell. Saved to your notebooks.`,
          notebook.cells[0]?.id,
          said,
        )
      }),
  )
  server.registerTool(
    "get_notebook",
    {
      title: "Read composer notebook",
      description:
        "Read a notebook's cells: their stable IDs and sources, and the revision. Read it to edit a cell, or to build on what the cells above set and name. Settings and definitions carry down through music cells.",
      inputSchema: { notebookId },
      outputSchema: { notebook: notebookSchema },
      annotations: readOnly,
      _meta: { ...security(), ui: { visibility: ["app", "model"] } },
    },
    ({ notebookId }) => respond(async () => result({ notebook: await store.read(notebookId) })),
  )
  registerAppTool(
    server,
    "add_music_cell",
    {
      title: "Add music cell",
      description:
        "Append a music cell to a saved notebook and show it. The source is checked where it lands, after the cells above it: with errors nothing is saved and the errors come back; without, the result is what parse would say of it (settings, names, a grid of every hit, the chords). No parse or get_notebook call is needed first. Say the notebook you are adding to before calling.",
      inputSchema: { notebookId, source },
      outputSchema: notebookChangeSchema.shape,
      annotations: add,
      _meta: { ...security(true), ui },
    },
    ({ notebookId, source }) =>
      respond(async () => {
        const cell: DocumentCell = { id: crypto.randomUUID(), type: "music", source }
        // An append can't lose anyone's work, so a save that raced another is tried again
        for (let attempt = 0; ; attempt++) {
          const doc = await store.read(notebookId)
          const cells = [...doc.cells, cell]
          const said = report(doc.cells, cells, cell.id, source)
          try {
            const notebook = await store.save(doc.id, cells, doc.revision)
            return changed(
              notebook,
              `Added cell ${notebook.cells.length} to "${notebook.title}". Saved to your notebooks.`,
              cell.id,
              said,
            )
          } catch (error) {
            if (!(error instanceof NotebookConflictError) || attempt >= 2) throw error
          }
        }
      }),
  )
  registerAppTool(
    server,
    "update_music_cell",
    {
      title: "Update music cell",
      description:
        "Replace one music cell's source in a saved notebook and show it. Only when the user asks to change that cell; otherwise append. Pass the revision you read the cell at, from get_notebook or the notebook context. The source is checked where it sits: with errors nothing is saved; without, the result is what parse would say of it, and names any cell below that the change broke. Say the notebook and cell before calling.",
      inputSchema: {
        notebookId,
        cellId: z.string(),
        source: z.string().max(1_000_000),
        expectedRevision: revision,
      },
      outputSchema: notebookChangeSchema.shape,
      annotations: edit,
      _meta: { ...security(true), ui },
    },
    ({ notebookId, cellId, source, expectedRevision }) =>
      respond(async () => {
        const doc = await store.read(notebookId)
        if (expectedRevision !== doc.revision) throw new NotebookConflictError()
        const cells = doc.cells.map((c) =>
          c.id === cellId && c.type === "music" ? { ...c, source } : c,
        )
        const said = checked(doc.cells, cells, cellId)
        const notebook = await store.save(doc.id, cells, expectedRevision)
        const number = notebook.cells.findIndex((c) => c.id === cellId) + 1
        return changed(
          notebook,
          `Updated cell ${number} in "${notebook.title}". Saved to your notebooks.`,
          cellId,
          said,
        )
      }),
  )
  // The app's own two tools. It saves what the user has typed, drafts included, and gets
  // back the revision alone; it asks for the revision to learn when to read again.
  registerAppTool(
    server,
    "save_notebook",
    {
      title: "Save notebook edits",
      description:
        "Save the notebook's cells as the user has them in the editor, unfinished drafts included, with a revision check. Returns the new revision.",
      inputSchema: {
        notebookId,
        cells: z.array(notebookCellSchema).max(2000),
        expectedRevision: revision,
      },
      outputSchema: notebookRevisionSchema.shape,
      annotations: edit,
      _meta: { ...security(true), ui: { visibility: ["app"] } },
    },
    ({ notebookId, cells, expectedRevision }) =>
      respond(async () => {
        const saved = await store.save(notebookId, cells, expectedRevision)
        return result({ notebookId: saved.id, revision: saved.revision })
      }),
  )
  registerAppTool(
    server,
    "notebook_revision",
    {
      title: "Notebook revision",
      description: "The notebook's current revision, to tell whether it changed.",
      inputSchema: { notebookId },
      outputSchema: notebookRevisionSchema.shape,
      annotations: readOnly,
      _meta: { ...security(), ui: { visibility: ["app"] } },
    },
    ({ notebookId }) => respond(async () => result({ ...(await store.revision(notebookId)) })),
  )
  registerAppTool(
    server,
    "rename_notebook",
    {
      title: "Rename notebook",
      description: "Give the notebook a new title, from the app's sidebar. Its cells don't change.",
      inputSchema: { notebookId, title: z.string().max(200) },
      outputSchema: notebookSummarySchema.shape,
      annotations: edit,
      _meta: { ...security(true), ui: { visibility: ["app"] } },
    },
    ({ notebookId, title }) =>
      // An emptied name is "Untitled", as on the website
      respond(async () =>
        result({ ...(await store.rename(notebookId, title.trim() || "Untitled")) }),
      ),
  )
  if (store.profile)
    server.registerTool(
      "get_profile",
      {
        title: "Connected composer account",
        description: "Identify the composer-nb account connected to this chat.",
        inputSchema: {},
        outputSchema: { id: z.string(), name: z.string(), email: z.string().optional() },
        annotations: readOnly,
        _meta: { ...security(), "openai/profile": true },
      },
      () => respond(async () => result({ ...(await store.profile!()) })),
    )
}
