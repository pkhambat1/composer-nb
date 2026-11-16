import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { initialState, parseCell } = await import("../../src/language.ts")

describe("the grooves library", () => {
  it("holds cells that parse, in two sections", async () => {
    const { GROOVES, SECTIONS, searchGrooves } = await import("../../src/grooves.ts")
    expect(SECTIONS).toEqual(["Transcriptions", "Harmony"])
    for (const g of GROOVES) {
      const p = parseCell(g.source, initialState())
      expect(p.errors, g.title).toEqual([])
      expect(p.outputs.length, g.title).toBeGreaterThan(0)
    }
    expect(searchGrooves("phrygian").map((g) => g.title)[0]).toBe("Phrygian walk")
    for (const mode of ["Lydian", "Mixolydian", "Dorian", "Minor", "Phrygian", "Locrian"]) {
      expect(searchGrooves(mode.toLowerCase()).map((g) => g.title)).toContain(`${mode} walk`)
    }
  })
})
