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
import { changedNotebook, type NotebookRepository, type SaveOptions } from "./notebook.ts"

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
  save(cells: DocumentCell[], expectedRevision: number, options?: SaveOptions): NotebookDocument {
    const lockPath = this.path + ".lock"
    let lock: number
    try {
      lock = openSync(lockPath, "wx", 0o600)
    } catch {
      throw new Error("The notebook is being saved by another process. Read it again and retry.")
    }
    const temporary = this.path + "." + crypto.randomUUID() + ".tmp"
    try {
      const next = changedNotebook(this.read(), cells, expectedRevision, options)
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
