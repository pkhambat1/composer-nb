/* A cell, read and played: parseCell. It reads the cell's lines in order: settings at the
   top, names, withs and plays. Each play is evaluated into a clip (eval.ts), and the clips
   are put back to back into one timeline, with the blocks the grid and the sheet draw. */
import { CellReader } from "./cell-reader.ts"
import type { State } from "./state.ts"
import { initialState } from "./state.ts"

export type { GridBlock, Output } from "./cell-grid.ts"

// A cell, read: each play's output, the same back to back, the errors, and the state it
// hands on
export type Parsed = ReturnType<typeof parseCell> & { warnings?: string[] }

// Parses one music cell. `inherited` is the state left by the cells above (settings and
// definitions); the result's `state` is what this cell passes on. Each play gives one
// output.
export function parseCell(src: unknown, inherited: State = initialState()) {
  const reader = new CellReader(src, inherited)
  reader.read()
  return reader.result()
}
