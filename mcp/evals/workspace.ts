/* The account's notebooks in memory, for a run to change and the graders to read after.
   It answers as SupabaseNotebookWorkspace does, errors included. */
import { NotebookConflictError } from "../src/notebook.ts"
import type { NotebookWorkspace } from "../src/notebook-workspace.ts"
import type {
  DocumentCell,
  NotebookDocument,
  NotebookList,
  NotebookSummary,
} from "../src/notebook-document.ts"

const PAGE = 50

export class MemoryWorkspace implements NotebookWorkspace {
  // The server switches to its hosted save workflow and instructions on this
  cloud = true
  // Newest first, as the website lists them
  private notebooks: NotebookDocument[]
  constructor(notebooks: NotebookDocument[]) {
    this.notebooks = structuredClone(notebooks)
  }
  private find(id?: string): NotebookDocument {
    if (!id) throw new Error("Choose a notebook ID from list_notebooks")
    const doc = this.notebooks.find((n) => n.id === id)
    if (!doc) throw new Error("Notebook unavailable")
    return doc
  }
  async list(offset = 0): Promise<NotebookList> {
    const rows = this.notebooks.slice(offset, offset + PAGE + 1)
    return {
      notebooks: rows.slice(0, PAGE).map(({ id, title, revision }) => ({ id, title, revision })),
      ...(rows.length > PAGE ? { nextOffset: offset + PAGE } : {}),
    }
  }
  async create(title: string, source = ""): Promise<NotebookDocument> {
    const doc: NotebookDocument = {
      id: crypto.randomUUID(),
      title,
      revision: 0,
      cells: [{ id: crypto.randomUUID(), type: "music", source }],
    }
    this.notebooks.unshift(doc)
    return structuredClone(doc)
  }
  async read(id?: string): Promise<NotebookDocument> {
    return structuredClone(this.find(id))
  }
  async revision(id?: string) {
    const doc = this.find(id)
    return { notebookId: doc.id, revision: doc.revision }
  }
  async save(id: string | undefined, cells: DocumentCell[], revision: number) {
    const doc = this.find(id)
    if (new Set(cells.map((cell) => cell.id)).size !== cells.length)
      throw new Error("Cell IDs must be unique.")
    if (revision !== doc.revision) throw new NotebookConflictError()
    doc.revision += 1
    doc.cells = structuredClone(cells)
    return structuredClone(doc)
  }
  async rename(id: string | undefined, title: string): Promise<NotebookSummary> {
    const doc = this.find(id)
    doc.title = title
    return { id: doc.id, title, revision: doc.revision }
  }
  async profile() {
    return { id: "eval-user", name: "Eval User", email: "eval@example.com" }
  }
  /** The notebooks as they are now, for the graders */
  snapshot(): NotebookDocument[] {
    return structuredClone(this.notebooks)
  }
}
