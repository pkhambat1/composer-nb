/* of counts from something other than the key: a degree from a note (5 of C3 is G3) and a
   numeral from a chord (V7 of V is D7 in C), on the major scale of what it counts from. A
   chain of of's takes brackets, 5 of (5 of C3), and the side each one takes is checked. */
import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../../js/music-engine.js")
const { highlightMusic } = await import("../../js/highlight.js")
const { sheetAbc } = await import("../../js/sheet.js")

const names = (src) => {
  const p = parseSource(src)
  expect(p.errors).toEqual([])
  return p.notes.map((e) => e.note.name)
}
const chords = (src) => {
  const p = parseSource(src)
  expect(p.errors).toEqual([])
  return p.chords.map((e) => e.chord.label)
}
const firstError = (src) => parseSource(src).errors[0]?.msg
const painted = (src, word) =>
  highlightMusic(src)
    .flat()
    .filter((p) => p.s === word)
    .map((p) => p.c)

describe("of in notes", () => {
  it("counts a degree on the major scale of the note after it", () => {
    expect(names("play piano: 5 of C3--- b3 of C3--- 3 of D3--- 5' of C3---")).toEqual(["G3", "D#3", "F#3", "G4"])
    // whatever the key: of counts from its own note
    expect(names("set key Eb dorian\nplay piano: 5 of C3---")).toEqual(["G3"])
  })

  it("counts from a degree of the key", () => {
    expect(names("set key D\nset octave 3\nplay piano: 5 of 1--- 5 of 5---")).toEqual(["A3", "E4"])
  })

  it("chains in brackets: the circle of fifths", () => {
    const src = "set octave 3\nplay piano: C3--- 5 of C3--- 5 of (5 of C3)--- 5 of (5 of (5 of C3))---"
    expect(names(src)).toEqual(["C3", "G3", "D4", "A4"])
    expect(names("play piano: 3 of (5 of D3)---")).toEqual(["C#4"])
  })

  it("is one note: it takes marks, lengths and a name", () => {
    const p = parseSource("notes lift = ^5 of C3---, 2 beats 5 of (5 of C3)\nplay piano: lift")
    expect(p.errors).toEqual([])
    expect(p.notes.map((e) => [e.note.name, !!e.accent])).toEqual([["G3", true], ["D4", false]])
  })

  it("shows and spells the note it is", () => {
    const p = parseSource("play piano: b3 of C4--- 5 of (5 of C3)---")
    expect(p.notes.map((e) => e.label)).toEqual(["Eb4", "D4"])
    // b3 of C is an E flat on the staff, not a D sharp
    const abc = sheetAbc(p.outputs[0].blocks[0]).abc.split("\n").find((l) => l.startsWith("[V:"))
    expect(abc).toBe("[V:P1] _E4 D4 z4 z4 |")
  })

  it("moves with transpose, and keeps the note as written", () => {
    const p = parseSource("set transpose 2\nplay piano: 5 of C3---")
    expect([p.notes[0].note.name, p.notes[0].label]).toEqual(["A3", "G3"])
  })

  it("says what's wrong", () => {
    expect(firstError("play piano: 5 of 5 of C3")).toBe("A chain of of's takes brackets: 5 of (5 of C3)")
    expect(firstError("play piano: C3 of C3")).toMatch(/^of takes a degree in front of it/)
    expect(firstError("play piano: 5 of")).toMatch(/^After of goes the note to count from/)
    expect(firstError("play piano: 5 of [C3]")).toMatch(/^After of goes the note to count from/)
    expect(firstError("play piano: 5 of (5 of C3")).toBe("The ( after of closes on its line: 5 of (5 of C3)")
    // only of joins a note to the one it counts from
    expect(firstError("play piano: 5@C3")).toMatch(/isn't a note/)
    expect(firstError("set key C\nplay piano: chords V7@V")).toMatch(/isn't a chord I know/)
    expect(firstError("notes of = C3---\nplay piano: of")).toBe("of already means something, so pick another name")
  })
})

describe("of in charts", () => {
  it("counts a numeral from the root of the chord after it", () => {
    expect(chords("set key C\nplay piano: chords V7 of V|V7 I")).toEqual(["D7", "G7", "C"])
    expect(chords("set key C\nplay piano: chords ii7 of IV V of bVII")).toEqual(["Gm7", "F"])
    expect(chords("set key F\nplay piano: chords V7 of ii|ii V7 I -")).toEqual(["D7", "Gm", "C7", "F"])
    // a numeral takes what it takes in a chart
    expect(chords("set key Cm\nplay piano: chords V7alt of iv V7 of bVI")).toEqual(["C7alt", "Eb7"])
  })

  it("takes only the chord's root", () => {
    expect(chords("set key C\nplay piano: chords V of v")).toEqual(chords("set key C\nplay piano: chords V of V"))
  })

  it("chains in brackets, takes a bass note at the end, and goes in a name", () => {
    expect(chords("set key C\nplay piano: chords V7 of (V of V)|V7 of V|V7|I")).toEqual(["A7", "D7", "G7", "C"])
    expect(chords("set key C\nplay piano: chords V7 of V/F#")).toEqual(["D7/F#"])
    expect(chords("set key C\nchords turn = V7 of (V of V) V7 of V\nplay piano: chords turn")).toEqual(["A7", "D7"])
  })

  it("keeps its name under transpose", () => {
    const p = parseSource("set key C\nset transpose 2\nplay guitar: chords V7 of V")
    expect([p.chords[0].chord.label, p.chords[0].transpose]).toEqual(["D7", 2])
  })

  it("says what's wrong", () => {
    const err = (chart) => firstError("set key C\nplay piano: chords " + chart)
    expect(err("V7 of V of V")).toBe("A chain of of's takes brackets: V7 of (V of V)")
    expect(err("V7 of G")).toBe("After of, a chart takes a numeral, not a chord name: V7 of V")
    expect(err("5 of V")).toBe("In a chart, of takes a numeral in front of it, counted from the chord after it: V7 of V")
    expect(err("V7 of [V]")).toBe("After of, a chart takes a numeral to count from: V7 of V")
    expect(err("V7 of (V of V")).toBe("The ( after of closes on its line: V7 of (V of V)")
    expect(firstError("set key C\nchords turn = V7 of G\nplay piano: chords turn")).toBe(
      "After of, a chart takes a numeral, not a chord name: V7 of V",
    )
  })
})

describe("of in the editor", () => {
  it("is a keyword, and its brackets are punctuation", () => {
    const src = "play piano: 5 of (5 of C3)---\nplay piano: chords V7 of (V of V)/F#"
    expect(painted(src, "of")).toEqual(Array(4).fill("tk-directive-key"))
    expect(painted(src, "(")).toEqual(["tk-punct", "tk-punct"])
    expect(painted(src, ")")).toEqual(["tk-punct", "tk-punct"])
    expect(painted(src, "C3")).toEqual(["tk-note"])
    expect(painted(src, "F#")).toEqual(["tk-bass"])
  })

  it("marks a chain without brackets, and an of with nothing on one side", () => {
    expect(painted("play piano: 5 of 5 of C3", "of")).toEqual(["tk-directive-key", "tk-error"])
    expect(painted("play piano: 5 of", "of")).toEqual(["tk-error"])
    expect(painted("play piano: chords of V", "of")).toEqual(["tk-error"])
  })
})
