import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../../js/music-engine.js")

const pitchClasses = (chord) => chord.notesMidi.map((m) => ((m % 12) + 12) % 12).sort((a, b) => a - b)

describe("capo", () => {
  it("transposes guitar notes up N semis but keeps the shape label", () => {
    const { chords, errors } = parseSource("capo: 6\nguitar: C")
    expect(errors).toEqual([])
    const c = chords[0].chord
    expect(c.label).toMatch(/^C/)
    // C shape (C, E, G = 0,4,7) shifted +6 → F#, A#, C# = 6, 10, 1
    expect(pitchClasses(c)).toEqual([1, 6, 10])
    expect(c.noteNames.every((n) => /^(F#|A#|C#)/.test(n))).toBe(true)
  })

  it("leaves other instruments alone", () => {
    const { chords, errors } = parseSource("capo: 6\npiano: C\nguitar: C")
    expect(errors).toEqual([])
    expect(pitchClasses(chords.find((e) => e.instrument === "piano").chord)).toEqual([0, 4, 7])
  })

  it("rejects out-of-range capo values", () => {
    const { errors } = parseSource("capo: 99\nguitar: C")
    expect(errors.some((e) => /0 to 12/.test(e.msg))).toBe(true)
  })

  it("is a no-op at fret 0", () => {
    const { chords } = parseSource("capo: 0\nguitar: C")
    expect(pitchClasses(chords[0].chord)).toEqual([0, 4, 7])
  })
})

describe("capo needs a guitar", () => {
  const firstError = (src, inherited) => parseSource(src, inherited).errors[0]?.msg

  it("flags a capo when nothing in the cell plays guitar", () => {
    expect(firstError("capo: 2\nC")).toMatch(/capo only works on guitar/)
    expect(firstError("sound: piano\ncapo: 2\nC")).toMatch(/capo only works on guitar/)
  })

  it("accepts a capo with sound: guitar or a guitar: line, in any block", () => {
    expect(parseSource("sound: guitar\ncapo: 2\nC").errors).toEqual([])
    expect(parseSource("capo: 2\n\nguitar: C").errors).toEqual([])
    expect(parseSource("capo: 2\nC\nguitar: G").errors).toEqual([])
  })

  it("doesn't mind capo: 0", () => {
    expect(parseSource("capo: 0\nC").errors).toEqual([])
  })

  it("lets a cell below a guitar cell switch to piano", () => {
    const above = parseSource("sound: guitar\ncapo: 2\nC").state
    expect(parseSource("sound: piano\nC", above).errors).toEqual([])
  })
})
