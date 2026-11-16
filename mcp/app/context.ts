import { initialState, parseCell } from "composer-nb/language"
import type { NotebookDocument } from "../src/notebook-document.ts"

/** The part of the editor's snapshot the text reads; the playground's NotebookSnapshot fits */
export type Snapshot = {
  cells: { id: string; source: string; type?: string }[]
  selectedId: string | null
  selection?: { selectedText?: string } | null
}

// The selected cell's errors, parsed after the cells above it as the notebook plays them
function errorsOf(cells: Snapshot["cells"], index: number): string {
  let state = initialState()
  for (const [i, cell] of cells.entries()) {
    if (cell.type && cell.type !== "music") continue
    const parsed = parseCell(cell.source, state)
    if (i === index) return parsed.errors.map((e) => `\n  line ${e.line}: ${e.msg}`).join("")
    state = parsed.state
  }
  return ""
}

// What the assistant is told of the editor: where the user is and the cell they are on.
// The rest of the notebook is a get_notebook away.
export function contextText(doc: NotebookDocument, snapshot: Snapshot): string {
  const index = snapshot.cells.findIndex((cell) => cell.id === snapshot.selectedId)
  const cell = snapshot.cells[index]
  const where = !cell
    ? "No cell selected"
    : snapshot.selection?.selectedText
      ? `Selected text in cell ${index + 1}: ${snapshot.selection.selectedText}`
      : `Cell ${index + 1} selected`
  return (
    `The composer-nb notebook "${doc.title}" is open. Notebook ID: ${doc.id}, revision ${doc.revision}, ${snapshot.cells.length} cells. ${where}.` +
    (cell
      ? ` Its cell ID is ${cell.id} and it reads:\n\`\`\`composer-nb\n${cell.source}\n\`\`\``
      : "") +
    // So a fix goes straight to update_music_cell, with no parse to find what's wrong
    (cell && errorsOf(snapshot.cells, index)
      ? `\nIt doesn't play. Its errors:${errorsOf(snapshot.cells, index)}`
      : "") +
    "\nPass this notebookId to the notebook tools. Read get_notebook for the other cells."
  )
}
