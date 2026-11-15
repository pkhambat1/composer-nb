import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { NotebookConflictError, type NotebookRepository } from "./notebook.ts"
import {
  notebookSchema,
  notebookSummarySchema,
  type NotebookSummary,
  type NotebookDocument,
  type DocumentCell,
  type NotebookList,
} from "./notebook-document.ts"

export interface NotebookWorkspace {
  cloud: boolean
  list(offset?: number): Promise<NotebookList>
  create(title: string, source?: string): Promise<NotebookDocument>
  read(id?: string): Promise<NotebookDocument>
  /** The revision alone, which is all a poll needs. */
  revision(id?: string): Promise<{ notebookId: string; revision: number }>
  /** Replaces the cells when the notebook is still at `revision`; otherwise a NotebookConflictError. */
  save(id: string | undefined, cells: DocumentCell[], revision: number): Promise<NotebookDocument>
  /** A new title; the cells and the revision stay as they are. */
  rename(id: string | undefined, title: string): Promise<NotebookSummary>
  profile?(): Promise<{ id: string; name: string; email?: string }>
}
export class NotebookAuthorizationError extends Error {
  readonly challenge: string
  constructor(metadataUrl: string, scopes: string[]) {
    super("Connect your composer-nb account to access your notebooks.")
    this.challenge = `Bearer resource_metadata="${metadataUrl}", scope="${scopes.join(" ")}", error="insufficient_scope", error_description="Connect your composer-nb account to continue"`
  }
}

export function localWorkspace(store: NotebookRepository): NotebookWorkspace {
  const read = async (id?: string) => {
    const doc = store.read()
    if (id && id !== doc.id) throw new Error("Notebook unavailable")
    return doc
  }
  return {
    cloud: false,
    list: async () => {
      const { id, title, revision } = await read()
      return { notebooks: [{ id, title, revision }] }
    },
    create: async () => {
      throw new Error("This local connection serves one notebook")
    },
    read,
    revision: async (id) => {
      const doc = await read(id)
      return { notebookId: doc.id, revision: doc.revision }
    },
    save: async (id, cells, revision) => {
      await read(id)
      return store.save(cells, revision)
    },
    rename: async (id, title) => {
      await read(id)
      const doc = store.rename(title)
      return { id: doc.id, title: doc.title, revision: doc.revision }
    },
  }
}

const rowSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  revision: z.number().int(),
  document: z.object({
    version: z.literal(1),
    cells: z.array(
      z.object({
        id: z.string().optional(),
        type: z.enum(["text", "music"]),
        source: z.string(),
      }),
    ),
  }),
})
const fromRow = (row: unknown): NotebookDocument => {
  const value = rowSchema.parse(row)
  return notebookSchema.parse({
    ...value,
    cells: value.document.cells.map((cell, index) => ({
      ...cell,
      id: cell.id || `${value.id}:cell:${index}`,
    })),
  })
}
const fields = "id,title,document,revision"

/** Uses a server-only client. Every query explicitly scopes its owner; saves also
 * check ownership and revision atomically in the restricted database function. */
export class SupabaseNotebookWorkspace implements NotebookWorkspace {
  cloud = true
  private db: SupabaseClient
  private owner: (write?: boolean) => Promise<string>
  constructor(db: SupabaseClient, owner: (write?: boolean) => Promise<string>) {
    this.db = db
    this.owner = owner
  }
  async list(offset = 0): Promise<NotebookList> {
    const ownerId = await this.owner()
    const { data, error } = await this.db
      .from("notebooks")
      .select("id,title,revision")
      .eq("owner_id", ownerId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .order("id")
      .range(offset, offset + 50)
    if (error) throw new Error("Could not load your notebooks")
    const rows = z.array(notebookSchema.pick({ id: true, title: true, revision: true })).parse(data)
    return {
      notebooks: rows.slice(0, 50),
      ...(rows.length > 50 ? { nextOffset: offset + 50 } : {}),
    }
  }
  async read(id?: string) {
    const ownerId = await this.owner()
    if (!id) throw new Error("Choose a notebook ID from list_notebooks")
    const { data, error } = await this.db
      .from("notebooks")
      .select(fields)
      .eq("id", z.string().uuid().parse(id))
      .eq("owner_id", ownerId)
      .is("deleted_at", null)
      .maybeSingle()
    if (error || !data) throw new Error("Notebook unavailable")
    return fromRow(data)
  }
  async revision(id?: string) {
    const ownerId = await this.owner()
    if (!id) throw new Error("Choose a notebook ID from list_notebooks")
    const { data, error } = await this.db
      .from("notebooks")
      .select("id,revision")
      .eq("id", z.string().uuid().parse(id))
      .eq("owner_id", ownerId)
      .is("deleted_at", null)
      .maybeSingle()
    if (error || !data) throw new Error("Notebook unavailable")
    const row = rowSchema.pick({ id: true, revision: true }).parse(data)
    return { notebookId: row.id, revision: row.revision }
  }
  async create(title: string, source = "") {
    const ownerId = await this.owner(true)
    const cells: DocumentCell[] = [{ id: crypto.randomUUID(), type: "music", source }]
    const { data, error } = await this.db
      .from("notebooks")
      .insert({
        owner_id: ownerId,
        title,
        document: { version: 1, cells },
      })
      .select(fields)
      .single()
    if (error) throw new Error("Could not create notebook")
    return fromRow(data)
  }
  // One query: the database function checks the owner and the revision in the update.
  async save(id: string | undefined, cells: DocumentCell[], revision: number) {
    const ownerId = await this.owner(true)
    if (!id) throw new Error("Choose a notebook ID from list_notebooks")
    if (new Set(cells.map((cell) => cell.id)).size !== cells.length)
      throw new Error("Cell IDs must be unique.")
    const { data, error } = await this.db.rpc("save_mcp_notebook", {
      notebook_id: z.string().uuid().parse(id),
      notebook_owner: ownerId,
      expected_revision: revision,
      new_document: { version: 1, cells },
    })
    if (error || !data) {
      // The function refuses a stale revision and a notebook that isn't the owner's alike
      await this.read(id)
      throw new NotebookConflictError()
    }
    return fromRow(data)
  }
  async rename(id: string | undefined, title: string) {
    const ownerId = await this.owner(true)
    if (!id) throw new Error("Choose a notebook ID from list_notebooks")
    const { data, error } = await this.db
      .from("notebooks")
      .update({ title })
      .eq("id", z.string().uuid().parse(id))
      .eq("owner_id", ownerId)
      .is("deleted_at", null)
      .select("id,title,revision")
      .maybeSingle()
    if (error || !data) throw new Error("Notebook unavailable")
    return notebookSummarySchema.parse(data)
  }
  async profile() {
    const ownerId = await this.owner()
    const { data, error } = await this.db.auth.admin.getUserById(ownerId)
    if (error || !data.user) throw new Error("Account unavailable")
    const name = data.user.user_metadata?.full_name
    return {
      id: ownerId,
      name: typeof name === "string" ? name : data.user.email || "Composer user",
      email: data.user.email,
    }
  }
}
