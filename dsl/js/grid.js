/* The rows of the grid a play's output is drawn on, shared by the playground and the
   notebook widget: one row for each pitched instrument's line and each drum's, one cell a
   step. Pure, like the parser. */
import { LANES, PITCHED, TPQ } from "./language.ts"

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
  // The sticking, under the drums: R or L in the cell of the hit it names
  const hands = new Map()
  for (const e of block.drumEvents) {
    if (e.lane === "sticking") hands.set(Math.round(e.tick / cellTicks), { hit: true, sticking: true, text: e.hand })
  }
  if (hands.size) rows.push({ key: "sticking", label: "sticking", cells: hands })
  return { per, cellTicks, rows }
}

// A bar's groups of beats, in ticks: the groups of an added-up meter (3+4 over 8), the
// dotted quarters of a compound one (6 over 8, 12 over 8), else each quarter note. The
// grid shades every other group, and the sheet beams within them.
export function beatGroups(block) {
  if (block.groups.length > 1) return block.groups.map((g) => (g * 4 * TPQ) / block.unit)
  if (isCompound(block)) return Array.from({ length: block.groups[0] / 3 }, () => (3 * TPQ) / 2)
  const out = []
  for (let left = block.barTicks; left > 0; left -= TPQ) out.push(Math.min(TPQ, left))
  return out
}

// 6 over 8, 9 over 8, 12 over 8: felt in dotted quarters, and counted in eighths.
export const isCompound = (block) =>
  block.unit === 8 && block.groups.length === 1 && block.groups[0] % 3 === 0

const SAY = { 1: [""], 2: ["", "&"], 3: ["", "&", "a"], 4: ["", "e", "&", "a"] }

// How a bar's cells are counted: for each cell, its label (1 e & a, or the eighths of a
// compound meter: 1 & 2 & 3 &), whether it's on a beat, and whether its group is shaded.
export function gridCounts(block) {
  const per = Math.round((block.barTicks / TPQ) * block.res)
  const cellTicks = TPQ / block.res
  const ends = []
  let acc = 0
  for (const g of beatGroups(block)) ends.push((acc += g))
  const pulse = isCompound(block) ? TPQ / 2 : TPQ
  return Array.from({ length: per }, (_, col) => {
    const tick = col * cellTicks
    const n = Math.floor(tick / pulse)
    const within = tick - n * pulse
    const sub = Math.round(within / cellTicks)
    const label = !within
      ? String(n + 1)
      : isCompound(block)
        ? pulse / cellTicks === 2
          ? "&"
          : "."
        : (SAY[block.res]?.[sub] ?? ".")
    return { label, beat: !within, shaded: ends.findIndex((e) => tick < e - 1e-9) % 2 === 1 }
  })
}

// How the cells are counted, in words: "1 e & a", or "1 & 2 &" in 6 over 8.
export function countingOf(block) {
  if (isCompound(block)) return { 1: "1 2 3", 2: "1 2 3", 4: "1 & 2 &" }[block.res] || "in small steps"
  return { 1: "1 2 3", 2: "1 & 2 &", 3: "1 & a", 4: "1 e & a" }[block.res] || "in small steps"
}
