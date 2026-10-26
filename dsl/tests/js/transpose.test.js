import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../../js/music-engine.js")

const pitchClasses = (chord) =>
  chord.notesMidi.map((m) => ((m % 12) + 12) % 12).sort((a, b) => a - b)
const firstError = (src, inherited) => parseSource(src, inherited).errors[0]?.msg

describe("transpose", () => {
  it("moves a chord's sound and keeps its name, as a capo does a guitar's shape", () => {
    const { chords, errors } = parseSource("set transpose 6\nplay guitar: chords C")
    expect(errors).toEqual([])
    const c = chords[0].chord
    expect(c.label).toMatch(/^C/)
    // C (C, E, G = 0, 4, 7) six semitones up: F#, A#, C# = 6, 10, 1
    expect(pitchClasses(c)).toEqual([1, 6, 10])
    expect(c.noteNames.every((n) => /^(F#|A#|C#)/.test(n))).toBe(true)
  })

  it("moves every pitched instrument: chords, notes and degrees, up or down", () => {
    const p = parseSource(
      "set transpose 2\nplay {\n  guitar: {\n    chords C\n    E---\n  }\n  piano: chords C\n}",
    )
    expect(p.errors).toEqual([])
    expect(p.chords.map((e) => [e.instrument, e.transpose, pitchClasses(e.chord)])).toEqual([
      ["guitar", 2, [2, 6, 9]],
      ["piano", 2, [2, 6, 9]],
    ])
    expect(p.notes.map((e) => e.note.name)).toEqual(["F#3", "F#3", "F#3", "F#3"])
    expect(parseSource("set key C\nset octave 4\nset transpose -3\nplay piano: 1---3---").notes.map((e) => e.note.name)).toEqual(["A3", "C#4"])
    // what's written stays: the grid shows the note as written
    expect(parseSource("set transpose 2\nplay piano: C4---").notes[0].label).toBe("C4")
  })

  it("leaves drums alone", () => {
    const cell = "play {\n  kick: x-x-\n  tom.floor: --x-\n  piano: C4---\n}"
    const drums = (src) => JSON.stringify(parseSource(src).drumEvents)
    expect(drums("set transpose 5\n" + cell)).toBe(drums(cell))
  })

  it("applies from its line down, so a block can transpose one instrument", () => {
    const p = parseSource("play {\n  set transpose 4\n  guitar: chords C\n  set transpose 0\n  bass: C2---\n}")
    expect(pitchClasses(p.chords[0].chord)).toEqual([4, 8, 11])
    expect(p.notes[0].note.name).toBe("C2")
  })

  it("is a whole number of semitones from -12 to 12", () => {
    expect(firstError("set transpose 13")).toMatch(/transpose is a number of semitones from -12 to 12/)
    expect(firstError("set transpose 2.5")).toMatch(/transpose is a number of semitones/)
    expect(parseSource("set transpose -12\nplay piano: C4---").notes[0].note.name).toBe("C3")
    expect(parseSource("set transpose 1+1\nplay guitar: chords C").chords[0].transpose).toBe(2)
  })

  it("is nothing at 0", () => {
    const { chords } = parseSource("set transpose 0\nplay guitar: chords C")
    expect(pitchClasses(chords[0].chord)).toEqual([0, 4, 7])
  })
})

describe("transpose needs something with pitch", () => {
  it("is a mistake in a cell where only drums play", () => {
    expect(firstError("set transpose 2\nplay kick: x---")).toBe(
      "transpose moves notes and chords, and only drums play here. Give an instrument some: piano: chords C G",
    )
    expect(firstError("pattern vv = {\n  set transpose 2\n  kick: x---\n}\nplay vv")).toMatch(/only drums play here/)
  })

  it("is fine with any pitched instrument, or at 0", () => {
    expect(parseSource("set transpose 2\nplay piano: chords C").errors).toEqual([])
    expect(parseSource("set transpose 2\nplay bass: E2---").errors).toEqual([])
    expect(parseSource("set transpose 0\nplay kick: x---").errors).toEqual([])
  })

  it("lets a cell below play drums alone", () => {
    const above = parseSource("set transpose 2\nplay guitar: chords C").state
    expect(parseSource("play kick: x---", above).errors).toEqual([])
  })
})
