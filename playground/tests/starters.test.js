/* The starter notebook kept current: an untouched one gets the new starters when the page
   opens, and one that has been changed is left as it is. */
import { readFileSync } from "node:fs"
import { describe, it, expect } from "vitest"
import { fingerprint, refreshStarters } from "../src/shared/starters.ts"

// The welcome notebook's cells as they first shipped, before notebooks were marked
const FIRST = JSON.parse(
  readFileSync(new URL("./fixtures/welcome-2026-10-10.json", import.meta.url), "utf8"),
)

const OLD = [
  { type: "text", source: "# A music notebook" },
  { type: "music", source: "play { kick: x--- }" },
]
const NEW = [
  { type: "text", source: "# A music notebook" },
  { type: "music", source: "time 4 over 4\nplay { kick: x--- }" },
]
const welcome = (cells, starters) => ({ id: "n1", title: "Welcome", cells, starters, updated: 5 })

describe("fingerprint", () => {
  it("doesn't change, or every notebook made so far is forgotten", () => {
    expect(fingerprint(OLD)).toBe("wlh4wr4v9n")
  })

  it("reads only each cell's type and source", () => {
    expect(fingerprint(OLD.map((c) => ({ ...c, id: "c1", output: null })))).toBe(fingerprint(OLD))
  })

  it("tells a text cell from a music cell with the same source", () => {
    expect(fingerprint([{ type: "text", source: "x" }])).not.toBe(
      fingerprint([{ type: "music", source: "x" }]),
    )
  })
})

describe("refreshStarters", () => {
  it("gives an untouched starter notebook the current starters, and keeps its title, id and date", () => {
    const store = { current: "n1", list: [welcome(OLD, fingerprint(OLD))] }
    const next = refreshStarters(store, NEW)
    expect(next.list[0]).toEqual(welcome(NEW, fingerprint(NEW)))
    expect(next.current).toBe("n1")
  })

  it("leaves a starter notebook that has been changed", () => {
    const changed = [OLD[0], { type: "music", source: "play { snare: x--- }" }]
    const store = { current: "n1", list: [welcome(changed, fingerprint(OLD))] }
    expect(refreshStarters(store, NEW)).toBe(store)
  })

  it("leaves a notebook that wasn't made from the starters", () => {
    const store = { current: "n2", list: [{ id: "n2", title: "Mine", cells: OLD, updated: 1 }] }
    expect(refreshStarters(store, NEW)).toBe(store)
  })

  it("returns the same store when the starter notebook is already current", () => {
    const store = { current: "n1", list: [welcome(NEW, fingerprint(NEW))] }
    expect(refreshStarters(store, NEW)).toBe(store)
  })

  it("touches only the starter notebooks in a list", () => {
    const mine = { id: "n2", title: "Mine", cells: OLD, updated: 1 }
    const next = refreshStarters(
      { current: "n2", list: [mine, welcome(OLD, fingerprint(OLD))] },
      NEW,
    )
    expect(next.list[0]).toBe(mine)
    expect(next.list[1].cells).toEqual(NEW)
  })

  it("knows a welcome notebook from before notebooks were marked, untouched since", () => {
    const store = { current: "n1", list: [welcome(FIRST)] }
    expect(refreshStarters(store, NEW).list[0]).toEqual(welcome(NEW, fingerprint(NEW)))
  })

  it("leaves a welcome notebook from before the marks that has been changed", () => {
    const changed = FIRST.map((c, i) => (i === 1 ? { ...c, source: c.source + "\n" } : c))
    const store = { current: "n1", list: [welcome(changed)] }
    expect(refreshStarters(store, NEW)).toBe(store)
  })
})
