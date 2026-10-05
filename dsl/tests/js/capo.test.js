import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../../js/music-engine.js")

const pitchClasses = (chord) =>
  chord.notesMidi.map((m) => ((m % 12) + 12) % 12).sort((a, b) => a - b)

describe("capo", () => {
  it("transposes guitar notes up N semis but keeps the shape label", () => {
    const { chords, errors } = parseSource("capo 6\nplay guitar: chords C")
    expect(errors).toEqual([])
    const c = chords[0].chord
    expect(c.label).toMatch(/^C/)
    // C shape (C, E, G = 0,4,7) shifted +6 → F#, A#, C# = 6, 10, 1
    expect(pitchClasses(c)).toEqual([1, 6, 10])
    expect(c.noteNames.every((n) => /^(F#|A#|C#)/.test(n))).toBe(true)
  })

  it("rejects out-of-range capo values", () => {
    const { errors } = parseSource("capo 99\nplay guitar: chords C")
    expect(errors.some((e) => /0 to 12/.test(e.msg))).toBe(true)
  })

  it("is a no-op at fret 0", () => {
    const { chords } = parseSource("capo 0\nplay guitar: chords C")
    expect(pitchClasses(chords[0].chord)).toEqual([0, 4, 7])
  })

  it("moves an electric guitar's chords too", () => {
    const { chords, errors } = parseSource("capo 6\nplay guitar.electric: chords C")
    expect(errors).toEqual([])
    expect(pitchClasses(chords[0].chord)).toEqual([1, 6, 10])
  })

  it("moves only the guitar's chords: not another instrument's, and not notes", () => {
    const p = parseSource(
      "capo 2\nplay {\n  guitar: {\n    chords C\n    E---\n  }\n  piano: chords C\n}",
    )
    expect(p.errors).toEqual([])
    expect(p.chords.map((e) => [e.instrument, e.capo, pitchClasses(e.chord)])).toEqual([
      ["guitar", 2, [2, 6, 9]],
      ["piano", 0, [0, 4, 7]],
    ])
    // A note's name is its pitch, wherever the capo is.
    expect(p.notes.map((e) => e.note.name)).toEqual(["E3", "E3", "E3", "E3"])
  })
})

describe("capo needs a guitar", () => {
  const firstError = (src, inherited) => parseSource(src, inherited).errors[0]?.msg

  it("flags a capo when no guitar in the cell plays chords", () => {
    expect(firstError("capo 2\nplay piano: chords C")).toMatch(
      /capo only moves a guitar's chords. Give a guitar some: guitar: chords Am F\|C G/,
    )
    expect(firstError("pattern v = {\n  capo 2\n  piano: chords C\n}\nplay v")).toMatch(
      /capo only moves a guitar's chords/,
    )
    expect(firstError("capo 2\nplay guitar: E---")).toMatch(/capo only moves a guitar's chords/)
  })

  it("accepts a capo when the chords play on guitar", () => {
    expect(parseSource("capo 2\nplay guitar: chords C").errors).toEqual([])
    expect(parseSource("pattern v = {\n  capo 2\n  guitar: chords C\n}\nplay v").errors).toEqual([])
  })

  it("doesn't mind capo 0", () => {
    expect(parseSource("capo 0\nplay piano: chords C").errors).toEqual([])
  })

  it("lets a cell below a guitar cell play piano", () => {
    const above = parseSource("capo 2\nplay guitar: chords C").state
    expect(parseSource("play piano: chords C", above).errors).toEqual([])
  })
})
