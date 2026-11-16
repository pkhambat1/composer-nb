/* A broken cell, written with what's wrong in it marked: ⟦ and ⟧ go around each stretch
   of code the engine must report a mistake about, and nothing else. `above` is the source
   of the cells above it, when the mistake needs one (a name defined there). */
export type Case = { cell: string; above?: string }

// The marked spans of a case, and its source without the marks
export function marked(cell: string) {
  const spans: { line: number; col: number; endLine: number; endCol: number }[] = []
  let src = ""
  let line = 1
  let col = 0
  let open: { line: number; col: number } | null = null
  for (const c of cell.split("")) {
    if (c === "⟦") open = { line, col }
    else if (c === "⟧") {
      if (!open) throw new Error(`A ⟧ with no ⟦ in ${JSON.stringify(cell)}`)
      spans.push({ ...open, endLine: line, endCol: col })
      open = null
    } else {
      src += c
      if (c === "\n") {
        line++
        col = 0
      } else col++
    }
  }
  if (open) throw new Error(`A ⟦ with no ⟧ in ${JSON.stringify(cell)}`)
  return { src, spans }
}
