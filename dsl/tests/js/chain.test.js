import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { parseSource, parseChain } = await import("../../js/music-engine.ts")

const labels = (p) => p.chords.map((e) => e.label)

describe("parseChain", () => {
  it("starts from the settings the earlier cells ended on", () => {
    const p = parseChain([
      "set tempo 90\nset transpose 2\nplay guitar: chords Am",
      "play guitar: chords G D",
    ])
    expect(p.errors).toEqual([])
    expect(p.blocks[0].tempo).toBe(90)
    expect(p.chords.map((e) => `${e.instrument} transpose ${e.transpose}`)).toEqual([
      "guitar transpose 2",
      "guitar transpose 2",
    ])
  })

  it("won't take a name that differs from one carried in only in its capitals", () => {
    expect(
      parseChain(["pattern partA = { kick: x }", "pattern parta = { snare: x }"]).errors[0]?.msg,
    ).toBe("parta differs from partA only in its capitals, so pick another name or write partA")
  })

  it("carries named chords, notes and patterns as well as settings", () => {
    expect(labels(parseChain(["chords intro = Am E7|G D", "play piano: chords intro"]))).toEqual([
      "Am",
      "E7",
      "G",
      "D",
    ])
    expect(labels(parseChain(["pattern vv = {\n  piano: chords F C\n}", "play (vv vv)"]))).toEqual([
      "F",
      "C",
      "F",
      "C",
    ])
    const riff = parseChain(["notes riff = F---G---", "play guitar: notes riff"])
    expect(riff.notes.map((e) => e.label)).toEqual(["F", "G"])
  })

  it("only plays the last cell", () => {
    expect(labels(parseChain(["play piano: chords C F", "play piano: chords G"]))).toEqual(["G"])
  })

  it("lets the last cell change what it inherits", () => {
    expect(
      parseChain(["set tempo 120\nplay piano: chords C", "set tempo 80\nplay piano: chords F"])
        .blocks[0].tempo,
    ).toBe(80)
  })

  it("matches parseSource for a single cell", () => {
    const src = "set key A\nplay piano: chords I V"
    expect(labels(parseChain([src]))).toEqual(labels(parseSource(src)))
  })
})
