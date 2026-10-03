import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { parseSource, parseChain } = await import("../../js/music-engine.js")

const labels = (p) => p.chords.map((e) => e.label)

describe("parseChain", () => {
  it("starts from the settings the earlier cells ended on", () => {
    const p = parseChain(["sound guitar\ntempo 90\ncapo 2\nplay chords: Am", "play chords: G D"])
    expect(p.errors).toEqual([])
    expect(p.blocks[0].tempo).toBe(90)
    expect(p.chords.map((e) => `${e.instrument} capo ${e.capo}`)).toEqual([
      "guitar capo 2",
      "guitar capo 2",
    ])
  })

  it("carries named chords and patterns as well as settings", () => {
    expect(labels(parseChain(["intro = Am E7|G D", "play chords: intro"]))).toEqual([
      "Am",
      "E7",
      "G",
      "D",
    ])
    expect(labels(parseChain(["v = {\n  chords: F C\n}", "play v * 2"]))).toEqual([
      "F",
      "C",
      "F",
      "C",
    ])
  })

  it("only plays the last cell", () => {
    expect(labels(parseChain(["play chords: C F", "play chords: G"]))).toEqual(["G"])
  })

  it("lets the last cell change what it inherits", () => {
    expect(
      parseChain(["tempo 120\nplay chords: C", "tempo 80\nplay chords: F"]).blocks[0].tempo,
    ).toBe(80)
  })

  it("matches parseSource for a single cell", () => {
    const src = "key A\nplay chords: I V"
    expect(labels(parseChain([src]))).toEqual(labels(parseSource(src)))
  })
})
