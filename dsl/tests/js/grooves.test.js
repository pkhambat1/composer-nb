import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../../js/music-engine.ts")
const { initialState } = await import("../../js/language.ts")
const { GROOVES } = await import("../../js/grooves.ts")

// What a cell plays: its notes, chords and hits, with their times
const plays = (r) => JSON.stringify({ events: r.events, drums: r.drumEvents, total: r.totalSec })

// Settings carry on into the cells below, so a starter states every setting it relies on
// that a starter above it in the welcome notebook changes, and plays the same after each of
// them. Swing is off unless it's set, so the swung ones come last.
describe("a starter plays the same after the starters above it", () => {
  const alone = new Map(GROOVES.map((g) => [g.title, parseSource(g.source, initialState())]))
  const after = GROOVES.map((g) => [g.title, alone.get(g.title).state])

  GROOVES.forEach((g, i) => {
    it(g.title, () => {
      expect(alone.get(g.title).errors).toEqual([])
      const own = plays(alone.get(g.title))
      const wrong = after
        .slice(0, i)
        .map(([t, st]) => {
          const r = parseSource(g.source, st)
          if (r.errors.length) return `after ${t}: line ${r.errors[0].line} ${r.errors[0].msg}`
          return plays(r) === own ? null : `after ${t}: plays differently`
        })
        .filter(Boolean)
      expect(wrong).toEqual([])
    })
  })
})
