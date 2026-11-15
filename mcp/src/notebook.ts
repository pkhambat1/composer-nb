import { registerAppTool } from "@modelcontextprotocol/ext-apps/server"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { initialState, parseCell } from "composer-nb/language"
import { z } from "zod"
import { NOTEBOOK_UI } from "./app.ts"
import { NotebookAuthorizationError, type NotebookWorkspace } from "./notebook-workspace.ts"
import {
  notebookSchema,
  notebookListSchema,
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

function result(value: Record<string, unknown>): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value }
}
async function respond(work: () => Promise<Record<string, unknown>>): Promise<CallToolResult> {
  try {
    return result(await work())
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: error instanceof Error ? error.message : "Notebook operation failed",
        },
      ],
      ...(error instanceof NotebookAuthorizationError
        ? { _meta: { "mcp/www_authenticate": [error.challenge] } }
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
  const edit = { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
  const output = { notebook: notebookSchema, change: z.string().optional() }
  const source = z
    .string()
    .max(1_000_000)
    .default("")
    .describe("Validated music source to save. Omit for an empty cell.")
  const ui = { resourceUri: NOTEBOOK_UI }
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
    ({ offset }) => respond(async () => ({ ...(await store.list(offset)) })),
  )
  registerAppTool(
    server,
    "open_notebook",
    {
      title: "Open composer notebook",
      description:
        "Open a saved notebook by ID with editing, notation and playback. Without an ID, show the signed-in user's notebook picker.",
      inputSchema: { notebookId },
      outputSchema: {
        notebook: notebookSchema.optional(),
        ...Object.fromEntries(
          Object.entries(notebookListSchema.shape).map(([k, v]) => [k, v.optional()]),
        ),
      },
      annotations: readOnly,
      _meta: {
        ...security(),
        ui,
        "openai/ui": { entrypoints: [{ type: "global" }, { type: "thread" }] },
      },
    },
    ({ notebookId }) =>
      respond(async () =>
        store.cloud && !notebookId
          ? { ...(await store.list()) }
          : { notebook: await store.read(notebookId) },
      ),
  )
  registerAppTool(
    server,
    "create_notebook",
    {
      title: "Create notebook",
      description:
        "Create a persistent notebook in the signed-in account, optionally with a composed music cell. State the title and that you are creating a saved notebook before calling. Visible in the Composer website too.",
      inputSchema: { title: z.string().trim().min(1).max(200), source },
      outputSchema: output,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      _meta: { ...security(true), ui },
    },
    ({ title, source }) =>
      respond(async () => {
        const notebook = await store.create(title, source)
        return {
          notebook,
          change: `Created notebook "${notebook.title}" with one music cell. Saved to your notebooks.`,
        }
      }),
  )
  server.registerTool(
    "get_notebook",
    {
      title: "Read composer notebook",
      description:
        "Read a notebook's stable cell IDs, sources and revision before editing. Settings and definitions carry down through music cells.",
      inputSchema: { notebookId },
      outputSchema: output,
      annotations: readOnly,
      _meta: { ...security(), ui: { visibility: ["app", "model"] } },
    },
    ({ notebookId }) => respond(async () => ({ notebook: await store.read(notebookId) })),
  )
  registerAppTool(
    server,
    "update_music_cell",
    {
      title: "Update music cell",
      description:
        "Persistently replace one music cell in the specified notebook, also changing the Composer website notebook. State the notebook and cell being changed before calling. Only replace an existing cell when the user asks to edit it; otherwise append. Preserve unrelated content. Read get_notebook first and pass its revision. All music cells are validated before saving.",
      inputSchema: {
        notebookId,
        cellId: z.string(),
        source: z.string().max(1_000_000),
        expectedRevision: z.number().int().nonnegative(),
      },
      outputSchema: output,
      annotations: edit,
      _meta: { ...security(true), ui },
    },
    ({ notebookId, cellId, source, expectedRevision }) =>
      respond(async () => {
        const doc = await store.read(notebookId)
        if (!doc.cells.some((c) => c.id === cellId && c.type === "music"))
          throw new Error("Unknown music cell")
        const notebook = await store.save(
          notebookId,
          doc.cells.map((c) => (c.id === cellId ? { ...c, source } : c)),
          expectedRevision,
        )
        return {
          notebook,
          change: `Updated cell ${doc.cells.findIndex((c) => c.id === cellId) + 1} in "${notebook.title}". Saved to your notebooks.`,
        }
      }),
  )
  registerAppTool(
    server,
    "save_notebook",
    {
      title: "Save notebook edits",
      description:
        "Save this notebook's complete cell order and sources with a revision check, including unfinished drafts.",
      inputSchema: {
        notebookId,
        cells: z.array(notebookCellSchema).max(2000),
        expectedRevision: z.number().int().nonnegative(),
      },
      outputSchema: output,
      annotations: edit,
      _meta: { ...security(true), ui: { visibility: ["app"] } },
    },
    ({ notebookId, cells, expectedRevision }) =>
      respond(async () => ({
        notebook: await store.save(notebookId, cells, expectedRevision, { validate: false }),
      })),
  )
  registerAppTool(
    server,
    "add_music_cell",
    {
      title: "Add music cell",
      description:
        "Persistently append a music cell to the specified notebook, optionally with composed source. State the notebook title and that you are adding a saved cell before calling. Existing cells are preserved; visible on the Composer website too.",
      inputSchema: { notebookId, source, expectedRevision: z.number().int().nonnegative() },
      outputSchema: output,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      _meta: { ...security(true), ui },
    },
    ({ notebookId, source, expectedRevision }) =>
      respond(async () => {
        const doc = await store.read(notebookId)
        const notebook = await store.save(
          notebookId,
          [...doc.cells, { id: crypto.randomUUID(), type: "music", source }],
          expectedRevision,
        )
        return {
          notebook,
          change: `Added cell ${notebook.cells.length} to "${notebook.title}". Saved to your notebooks.`,
        }
      }),
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
      () => respond(async () => ({ ...(await store.profile!()) })),
    )
}
