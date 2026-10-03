import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../../js/music-engine.js")

const play = (chords) => parseSource(`play chords: ${chords}`)
// Chord lengths in beats (quarter notes).
const beats = (chords) => play(chords).chords.map((e) => e.secDur * 2)
const labels = (chords) => play(chords).chords.map((e) => e.label)

describe("chord rhythm", () => {
  it("splits a bar evenly", () => {
    expect(beats("C Am F G")).toEqual([1, 1, 1, 1])
    expect(beats("C G")).toEqual([2, 2])
  })

  it("- holds the chord before", () => {
    expect(beats("C - - G")).toEqual([3, 1])
  })

  it("holds across a bar line", () => {
    expect(beats("C|- - G -")).toEqual([6, 2])
  })

  it("_ is silence", () => {
    const { chords } = play("C _ G _")
    expect(chords.map((e) => e.secStart * 2)).toEqual([0, 2])
    expect(chords.map((e) => e.secDur * 2)).toEqual([1, 1])
  })

  it("% repeats the bar before", () => {
    expect(labels("C G|%")).toEqual(["C", "G", "C", "G"])
  })

  it("rejects splits that don't land on sixteenths", () => {
    expect(play("C F G").errors[0].msg).toMatch(/split evenly into 3/)
  })

  it("points the old . hold at -", () => {
    expect(play("C . G").errors[0].msg).toMatch(/Use - to hold a chord/)
  })

  it("rejects a hold with nothing to hold", () => {
    expect(play("- C").errors[0].msg).toMatch(/no chord to hold/)
  })
})
