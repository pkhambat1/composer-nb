import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { parseSource, parseChain, DEFAULT_DIRECTIVES } = await import("../../js/music-engine.js")

describe("parseChain", () => {
  it("starts from the settings the previous cell ended on", () => {
    const parsed = parseChain(["@key Bm\n@tempo 120\n@inst guitar\nBm F#", "G D"])
    expect(parsed.directives).toMatchObject({ key: "Bm", tempo: 120, inst: "guitar" })
    expect(parsed.chords.map((e) => e.label)).toEqual(["G", "D"])
  })

  it("lets the cell override what it inherits", () => {
    const parsed = parseChain(["@tempo 120\nC", "@tempo 80\nF"])
    expect(parsed.directives.tempo).toBe(80)
  })

  it("carries settings through every link in the chain", () => {
    const parsed = parseChain(["@key D", "@tempo 140", "I IV"])
    expect(parsed.directives).toMatchObject({ key: "D", tempo: 140 })
    expect(parsed.chords.map((e) => e.label)).toEqual(["D", "G"])
  })

  it("matches parseSource for a single cell", () => {
    expect(parseChain(["@key A\nI V"]).chords.map((e) => e.label)).toEqual(
      parseSource("@key A\nI V").chords.map((e) => e.label),
    )
  })

  it("drops an inherited capo silently when the instrument changes", () => {
    const parsed = parseChain(["@inst guitar\n@capo 2\nC", "@inst piano\nC"])
    expect(parsed.errors).toEqual([])
  })

  it("does not mutate the defaults", () => {
    parseSource("@tempo 200\nC", { key: "E" })
    expect(DEFAULT_DIRECTIVES.tempo).toBe(96)
    expect(DEFAULT_DIRECTIVES.key).toBe("C")
  })
})
