/* Two sets of edits to one notebook, made into one. When a save is refused because the
   notebook changed underneath it, the app has three versions: `base`, the cells both
   sides started from; `mine`, what the user has in the editor; `theirs`, what is saved
   now. Cells are matched by ID. Pure. */
import type { DocumentCell } from "../src/notebook-document.ts"

const same = (a: DocumentCell, b: DocumentCell) => a.type === b.type && a.source === b.source

// Their cells in their order, with the user's own edits, deletions and new cells kept.
// Where both changed one cell the user's wins, since theirs is saved and can be read again
// and the user's exists nowhere else. The user's reordering is not kept.
export function mergeCells(
  base: DocumentCell[],
  mine: DocumentCell[],
  theirs: DocumentCell[],
): DocumentCell[] {
  const baseById = new Map(base.map((c) => [c.id, c]))
  const mineById = new Map(mine.map((c) => [c.id, c]))
  const out: DocumentCell[] = []
  for (const cell of theirs) {
    const was = baseById.get(cell.id)
    const my = mineById.get(cell.id)
    if (!was)
      out.push(cell) // they added it
    else if (my) out.push(same(my, was) ? cell : my) // without one, the user deleted it
  }
  // What the user added, or changed after they deleted it, goes after the cell it follows
  mine.forEach((cell, i) => {
    if (out.some((c) => c.id === cell.id)) return
    const was = baseById.get(cell.id)
    if (was && same(cell, was)) return // they deleted a cell the user left alone
    const above = mine.slice(0, i).findLast((c) => out.some((o) => o.id === c.id))
    out.splice(above ? out.findIndex((c) => c.id === above.id) + 1 : 0, 0, cell)
  })
  return out
}
