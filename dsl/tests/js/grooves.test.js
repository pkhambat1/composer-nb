import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../../js/music-engine.js")
const { initialState } = await import("../../js/language.ts")
const { GROOVES } = await import("../../js/grooves.js")

// What a cell plays: its notes, chords and hits, with their times
const plays = (r) => JSON.stringify({ events: r.events, drums: r.drumEvents, total: r.totalSec })

// Settings carry on into the cells below, and the + menu puts a starter at the end of any
// notebook. So a starter states every setting it relies on, and plays the same after any
// other cell: after each of the other starters here.
describe("a starter plays the same wherever it goes", () => {
  const alone = new Map(GROOVES.map((g) => [g.title, parseSource(g.source, initialState())]))
  const after = GROOVES.map((g) => [g.title, alone.get(g.title).state])

  for (const g of GROOVES) {
    it(g.title, () => {
      expect(alone.get(g.title).errors).toEqual([])
      const own = plays(alone.get(g.title))
      const wrong = after
        .filter(([t]) => t !== g.title)
        .map(([t, st]) => {
          const r = parseSource(g.source, st)
          if (r.errors.length) return `after ${t}: line ${r.errors[0].line} ${r.errors[0].msg}`
          return plays(r) === own ? null : `after ${t}: plays differently`
        })
        .filter(Boolean)
      expect(wrong).toEqual([])
    })
  }
})
