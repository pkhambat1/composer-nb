/* The rows of the grid a play's output is drawn on, shared by the playground and the
   notebook widget: one row for each pitched instrument's line and each drum's, one cell a
   step. Pure, like the parser. */
import { LANES, PITCHED, TPQ } from "./language.js"

// `block` is one of a parsed output's `blocks`. Returns how many cells a bar has, and its
// rows from the top: pitched instruments (a row for each layer of an instrument's block),
// then the drums. A row's `cells` maps a cell's number, counted from the block's start, to
// what's in it: a hit ({ hit, accent, ghost, double }, and the note as `text` on a pitched
// row, with `note`), or { held, note } while a note is still sounding.
export function gridRows(block) {
  const per = Math.round((block.barTicks / TPQ) * block.res)
  const cellTicks = TPQ / block.res
  const rows = []
  for (const inst of PITCHED) {
    const notes = block.noteEvents.filter((e) => e.instrument === inst)
    const voices = [...new Set(notes.map((e) => e.voice))].sort((a, b) => a - b)
    voices.forEach((voice, i) => {
      const cells = new Map()
      for (const e of notes) {
        if (e.voice !== voice) continue
        const at = Math.round(e.tick / cellTicks)
        const end = Math.round((e.tick + e.ticks) / cellTicks)
        for (let c = at + 1; c < end; c++)
          if (!cells.has(c)) cells.set(c, { held: true, note: true })
        cells.set(at, { hit: true, note: true, accent: e.accent, ghost: e.ghost, text: e.label })
      }
      // An instrument's name goes on its first row only.
      rows.push({ key: `${inst} ${voice}`, label: i ? "" : inst, cells })
    })
  }
  for (const lane of LANES) {
    const cells = new Map()
    for (const e of block.drumEvents) {
      if (e.hidden || e.lane !== lane) continue
      const at = Math.round(e.tick / cellTicks)
      if (!cells.has(at) || e.vel > cells.get(at).vel) {
        cells.set(at, { hit: true, accent: e.accent, ghost: e.ghost, double: e.double, vel: e.vel })
      }
    }
    if (cells.size) rows.push({ key: lane, label: lane, cells })
  }
  return { per, cellTicks, rows }
}
