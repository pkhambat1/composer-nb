import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname } from "node:path"
import { notebookSchema, type DocumentCell, type NotebookDocument } from "./notebook-document.ts"
import { changedNotebook, type NotebookRepository } from "./notebook.ts"

/** The local notebook belongs to its owner, independently of ChatGPT or Claude. */
export class FileNotebookStore implements NotebookRepository {
  readonly path: string
  constructor(path: string) {
    this.path = path
    mkdirSync(dirname(path), { recursive: true })
    if (!existsSync(path)) {
      const notebook: NotebookDocument = {
        id: crypto.randomUUID(),
        title: basename(path).replace(/\.[^.]+$/, ""),
        revision: 0,
        cells: [],
      }
      writeFileSync(path, JSON.stringify(notebook, null, 2) + "\n", { flag: "wx", mode: 0o600 })
    }
    this.read()
  }
  read(): NotebookDocument {
    return notebookSchema.parse(JSON.parse(readFileSync(this.path, "utf8")))
  }
  save(cells: DocumentCell[], expectedRevision: number): NotebookDocument {
    return this.write((current) => changedNotebook(current, cells, expectedRevision))
  }
  rename(title: string): NotebookDocument {
    return this.write((current) => ({ ...current, title }))
  }
  // Reads, changes and replaces the file under a lock, so two processes can't interleave.
  private write(change: (current: NotebookDocument) => NotebookDocument): NotebookDocument {
    const lockPath = this.path + ".lock"
    let lock: number
    try {
      lock = openSync(lockPath, "wx", 0o600)
    } catch {
      throw new Error("The notebook is being saved by another process. Read it again and retry.")
    }
    const temporary = this.path + "." + crypto.randomUUID() + ".tmp"
    try {
      const next = change(this.read())
      writeFileSync(temporary, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 })
      renameSync(temporary, this.path)
      return next
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary)
      closeSync(lock)
      unlinkSync(lockPath)
    }
  }
}
