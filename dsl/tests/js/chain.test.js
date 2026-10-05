import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { parseSource, parseChain } = await import("../../js/music-engine.js")

const labels = (p) => p.chords.map((e) => e.label)

describe("parseChain", () => {
  it("starts from the settings the earlier cells ended on", () => {
    const p = parseChain(["tempo 90\ncapo 2\nplay guitar: chords Am", "play guitar: chords G D"])
    expect(p.errors).toEqual([])
    expect(p.blocks[0].tempo).toBe(90)
    expect(p.chords.map((e) => `${e.instrument} capo ${e.capo}`)).toEqual([
      "guitar capo 2",
      "guitar capo 2",
    ])
  })

  it("carries named chords, notes and patterns as well as settings", () => {
    expect(labels(parseChain(["chords intro = Am E7|G D", "play piano: chords intro"]))).toEqual([
      "Am",
      "E7",
      "G",
      "D",
    ])
    expect(labels(parseChain(["pattern v = {\n  piano: chords F C\n}", "play v v"]))).toEqual([
      "F",
      "C",
      "F",
      "C",
    ])
    const riff = parseChain(["notes riff = F---G---", "play guitar: riff"])
    expect(riff.notes.map((e) => e.label)).toEqual(["F", "G"])
  })

  it("only plays the last cell", () => {
    expect(labels(parseChain(["play piano: chords C F", "play piano: chords G"]))).toEqual(["G"])
  })

  it("lets the last cell change what it inherits", () => {
    expect(
      parseChain(["tempo 120\nplay piano: chords C", "tempo 80\nplay piano: chords F"]).blocks[0]
        .tempo,
    ).toBe(80)
  })

  it("matches parseSource for a single cell", () => {
    const src = "key A\nplay piano: chords I V"
    expect(labels(parseChain([src]))).toEqual(labels(parseSource(src)))
  })
})
