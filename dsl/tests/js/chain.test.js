import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { parseSource, parseChain } = await import("../../js/music-engine.js")

const labels = (p) => p.chords.map((e) => e.label)

describe("parseChain", () => {
  it("starts from the settings the earlier cells ended on", () => {
    const p = parseChain(["sound: guitar\ntempo: 90\ncapo: 2\nAm", "G D"])
    expect(p.errors).toEqual([])
    expect(p.blocks[0].tempo).toBe(90)
    expect(p.chords.map((e) => `${e.instrument} capo ${e.capo}`)).toEqual(["guitar capo 2", "guitar capo 2"])
  })

  it("carries words as well as settings", () => {
    expect(labels(parseChain(["intro = Am E7 | G D", "intro"]))).toEqual(["Am", "E7", "G", "D"])
  })

  it("only plays the last cell", () => {
    expect(labels(parseChain(["C F", "G"]))).toEqual(["G"])
  })

  it("lets the last cell change what it inherits", () => {
    expect(parseChain(["tempo: 120\nC", "tempo: 80\nF"]).blocks[0].tempo).toBe(80)
  })

  it("matches parseSource for a single cell", () => {
    expect(labels(parseChain(["key: A\nI V"]))).toEqual(labels(parseSource("key: A\nI V")))
  })
})
