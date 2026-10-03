import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../../js/music-engine.js")

const pitchClasses = (chord) =>
  chord.notesMidi.map((m) => ((m % 12) + 12) % 12).sort((a, b) => a - b)

describe("capo", () => {
  it("transposes guitar notes up N semis but keeps the shape label", () => {
    const { chords, errors } = parseSource("sound guitar\ncapo 6\nplay chords: C")
    expect(errors).toEqual([])
    const c = chords[0].chord
    expect(c.label).toMatch(/^C/)
    // C shape (C, E, G = 0,4,7) shifted +6 → F#, A#, C# = 6, 10, 1
    expect(pitchClasses(c)).toEqual([1, 6, 10])
    expect(c.noteNames.every((n) => /^(F#|A#|C#)/.test(n))).toBe(true)
  })

  it("rejects out-of-range capo values", () => {
    const { errors } = parseSource("sound guitar\ncapo 99\nplay chords: C")
    expect(errors.some((e) => /0 to 12/.test(e.msg))).toBe(true)
  })

  it("is a no-op at fret 0", () => {
    const { chords } = parseSource("sound guitar\ncapo 0\nplay chords: C")
    expect(pitchClasses(chords[0].chord)).toEqual([0, 4, 7])
  })
})

describe("capo needs a guitar", () => {
  const firstError = (src, inherited) => parseSource(src, inherited).errors[0]?.msg

  it("flags a capo when nothing in the cell plays guitar", () => {
    expect(firstError("capo 2\nplay chords: C")).toMatch(
      /capo only works on guitar. Add sound guitar/,
    )
    expect(firstError("pattern v = {\n  capo 2\n  chords: C\n}\nplay v")).toMatch(
      /capo only works on guitar/,
    )
  })

  it("accepts a capo when the chords play on guitar", () => {
    expect(parseSource("sound guitar\ncapo 2\nplay chords: C").errors).toEqual([])
    expect(
      parseSource("pattern v = {\n  sound guitar\n  capo 2\n  chords: C\n}\nplay v").errors,
    ).toEqual([])
  })

  it("doesn't mind capo 0", () => {
    expect(parseSource("capo 0\nplay chords: C").errors).toEqual([])
  })

  it("lets a cell below a guitar cell switch to piano", () => {
    const above = parseSource("sound guitar\ncapo 2\nplay chords: C").state
    expect(parseSource("sound piano\nplay chords: C", above).errors).toEqual([])
  })
})
