import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../../js/music-engine.js")

// Chord lengths in beats (quarter notes).
const beats = (src) => parseSource(src).chords.map((e) => e.ticks / 96)
const labels = (src) => parseSource(src).chords.map((e) => e.label)

describe("chord rhythm", () => {
  it("splits a bar evenly", () => {
    expect(beats("piano: C Am F G")).toEqual([1, 1, 1, 1])
    expect(beats("piano: C G")).toEqual([2, 2])
  })

  it(". holds the chord before", () => {
    expect(beats("piano: C . . G")).toEqual([3, 1])
  })

  it("holds across a bar line", () => {
    expect(beats("piano: C | . . G .")).toEqual([6, 2])
  })

  it("_ is silence", () => {
    const { chords } = parseSource("piano: C _ G _")
    expect(chords.map((e) => e.tick / 96)).toEqual([0, 2])
    expect(chords.map((e) => e.ticks / 96)).toEqual([1, 1])
  })

  it("% repeats the bar before", () => {
    expect(labels("piano: C G | %")).toEqual(["C", "G", "C", "G"])
  })

  it("rejects splits that don't land on sixteenths", () => {
    expect(parseSource("piano: C F G").errors[0].msg).toMatch(/split evenly into 3/)
  })

  it("rejects old duration suffixes", () => {
    expect(parseSource("piano: C.q G").errors[0].msg).toMatch(/durations like \.q are gone/)
  })

  it("rejects a hold with nothing to hold", () => {
    expect(parseSource("piano: . C").errors[0].msg).toMatch(/no chord to hold/)
  })
})
