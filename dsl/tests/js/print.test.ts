import { describe, expect, it } from "vitest"
import { parseCell } from "../../js/cell.ts"
import { Parser } from "../../js/parser.ts"
import { highlightMusic } from "../../js/highlight.ts"
import { printLayout, printRowText, printedItems, printedMeaning } from "../../js/print.ts"

const clean = (source: string) => {
  const p = parseCell(source)
  expect(p.errors, source).toEqual([])
  return p
}
const rows = (source: string) => printLayout(clean(source).prints).map(printRowText)
const items = (source: string) =>
  clean(source).prints.flatMap((p) => p.values.flatMap((v) => v.items))

describe("print", () => {
  it("keeps the values and their pitches, with no plays, audio events or elapsed time", () => {
    const p = clean("print(1, 2, 3)")
    expect(p.prints[0]).toMatchObject({ text: "1, 2, 3", key: "C", mode: "major", octave: 3 })
    expect(p.prints[0].values.map((v) => v.items[0])).toEqual([
      { text: "1", kind: "note", pitch: "C3", midi: 48 },
      { text: "2", kind: "note", pitch: "D3", midi: 50 },
      { text: "3", kind: "note", pitch: "E3", midi: 52 },
    ])
    for (const list of [p.outputs, p.events, p.drumEvents, p.notes, p.chords, p.blocks])
      expect(list).toEqual([])
    expect(p.totalSec).toBe(0)
  })

  it("evaluates interval functions while keeping resulting scale degrees visible", () => {
    const p = clean("print(fifth(1 3 5 7), fifth(1, 2))")
    expect(p.prints[0].text).toBe("5 7 9 11, 9")
    expect(p.prints[0].values[0].items.map((i) => i.pitch)).toEqual(["G3", "B3", "D4", "F4"])
    expect(items("print(fifth(-1 -2), octave(1, -1))").map((i) => [i.text, i.pitch])).toEqual([
      ["4", "F3"],
      ["3", "E3"],
      ["-7", "C2"],
    ])
    expect(items("print(fifth(b3))")[0]).toMatchObject({ text: "b7", pitch: "Bb3" })
  })

  it("uses settings at each statement, respecting with scopes and inherited names", () => {
    const p = clean(`notes phrase = 1 2 3
with key D, mode minor, octave 4 { print(phrase), }
print(phrase)
set key F
print(phrase)`)
    expect(p.prints.map((p) => p.values[0].items.map((i) => i.pitch))).toEqual([
      ["D4", "E4", "F4"],
      ["C3", "D3", "E3"],
      ["F3", "G3", "A3"],
    ])
    const next = parseCell("print(fifth(phrase))", p.state)
    expect(next.errors).toEqual([])
    expect(next.prints[0].values[0].items.map((i) => i.pitch)).toEqual(["C4", "D4", "E4"])
    expect(
      items("set mode wholeTone\nprint(octave(1), -6, 8)").map((i) => [i.text, i.pitch]),
    ).toEqual([
      ["7", "C4"],
      ["-6", "C2"],
      ["8", "D4"],
    ])
  })

  it("retains named types and shows chord tones and bass alongside the chart", () => {
    const p = clean(`notes melody = 1 3
chords harmony = 1 3|4 5
steps rhythm = x---
print(melody, fifth(harmony), rhythm)`)
    expect(p.prints[0].values.map((v) => v.type)).toEqual(["notes", "chords", "steps"])
    expect(p.prints[0].values[1].text).toBe("5 7 8 9")
    expect(
      printedItems(p.prints[0].values[1])
        .map((i) => i.text)
        .join(" "),
    ).toBe("5 7 8 9")
    expect(p.prints[0].values[1].items.find((i) => i.chord === "Bdim")).toMatchObject({
      tones: ["B3", "D4", "F4"],
    })
    expect(p.prints[0].values[1].items.find((i) => i.chord === "Bdim")).not.toHaveProperty("bass")
    expect(items("print(chords 1sus2add11#5/4)")[0]).toMatchObject({
      text: "1sus2add11#5/4",
      chord: "Csus2add11#5/F",
      tones: ["C3", "D3", "G#3", "F4"],
      bass: "F2",
    })
    expect(items("print(Cm7)")[0].chord).toBe("Cm7")
  })

  it("evaluates repeated values and articulation while omitting rhythmic marks", () => {
    const p = clean("print(fifth(2*(^1 3*- ~3 3*_)))")
    expect(p.prints[0].text).toBe("^5 ~7 ^5 ~7")
    expect(
      printedItems(p.prints[0].values[0])
        .map((i) => i.text)
        .join(" "),
    ).toBe(p.prints[0].text)
    expect(
      items("print(steps 2*(x- ^-))")
        .map((i) => i.text)
        .join(""),
    ).toBe("x-^-x-^-")
  })

  it("distinguishes written and sounding pitches under transpose", () => {
    const printed = items("set transpose 2\nprint(1, chords 1)")
    expect(printed[0]).toMatchObject({ text: "1", pitch: "C3", sounding: ["D3"] })
    expect(printed[1]).toMatchObject({
      chord: "C",
      tones: ["C3", "E3", "G3"],
      sounding: ["D3", "F#3", "A3"],
    })
    expect(printedMeaning(printed[0])).toBe("C3 → sounds D3")
  })

  it("lays a print out as one row per type, each value followed by its pitches in parentheses", () => {
    expect(rows("print(1, 2, 3)\nprint(fifth(1 3 5 7))")).toEqual([
      "notes 1(C3), 2(D3), 3(E3)",
      "notes 5(G3) 7(B3) 9(D4) 11(F4)",
    ])
    expect(rows("print(1 3 5 8, chords 1 6m | 4 5, steps x---)")).toEqual([
      "notes 1(C3) 3(E3) 5(G3) 8(C4)",
      "chords 1(C(C3 E3 G3)) 6m(Am(A3 C4 E4)) 4(F(F3 A3 C4)) 5(G(G3 B3 D4))",
      "steps x",
    ])
    expect(rows("print(Cm7)")[0]).toBe("chords Cm7(C3 Eb3 G3 Bb3)")
    expect(rows("print(fifth(2*(^1 3*- ~3 3*_)))")).toEqual([
      "notes ^5(G3) ~7(B3) ^5(G3) ~7(B3)",
    ])
    expect(rows("set transpose 2\nprint(1, chords 1)")).toEqual([
      "notes 1(D3)",
      "chords 1(D(D3 F#3 A3))",
    ])
    expect(rows("set transpose -2\nprint(Cm7, chords 1/3, chords Bb)")).toEqual([
      "chords Cm7(A#m7(A#2 C#3 F3 G#3)), 1/3(A#/D(A#2 D3 F3/D2)), Bb(G#(G#3 C4 D#4))",
    ])
    const layout = printLayout(clean("print(1)\nplay piano: notes 1---\nprint(2, steps x-)").prints)
    expect(layout.map((r) => [r.line, r.type])).toEqual([
      [1, "notes"],
      [3, "notes"],
      [3, "steps"],
    ])
  })

  it("prints the evaluated pitches without rests, holds, bar lines, or duration labels", () => {
    expect(rows("set key A\nset octave 2\nprint(notes 1-------5-------|)")).toEqual([
      "notes 1(A2) 5(E3)",
    ])
    expect(rows("print(notes C3---__D3|--E3_)")).toEqual([
      "notes C3 D3 E3",
    ])
    expect(rows("set transpose 2\nprint(notes 1---)")).toEqual([
      "notes 1(D3)",
    ])
  })

  it("evaluates single-chord names and functions without chart separators", () => {
    const source = "chords tonic = 1\nchords circle = tonic fifth(tonic)|fifth(tonic, 2)\ncircle"
    expect(rows(source)).toEqual([
      "chords 1(C(C3 E3 G3)) 5(G(G3 B3 D4)) 9(Dm(D4 F4 A4))",
    ])
    expect(clean(source).prints[0].text).toBe("1 5 9")
  })

  it("preserves chord degrees through interval functions and aliases", () => {
    expect(rows("chords tonic = 1\nchords dominant = fifth(tonic)\nprint(tonic, dominant)")).toEqual([
      "chords 1(C(C3 E3 G3)), 5(G(G3 B3 D4))",
    ])
    expect(rows("print(chords fifth(3) fifth(7) fifth(fifth(1)) fifth(1, -1) octave(1, -1))")).toEqual([
      "chords 7(Bdim(B3 D4 F4)) 11(F(F4 A4 C5)) 9(Dm(D4 F4 A4)) -4(F(F2 A2 C3)) -7(C(C2 E2 G2))",
    ])
    expect(rows("set mode wholeTone\nprint(chords octave(1))")).toEqual([
      "chords 7(Caug(C4 E4 G#4))",
    ])
  })

  it("prints transformed qualities and bass degrees accurately, retaining absolute names", () => {
    expect(rows("print(chords fifth(3m7) fifth(1/3) fifth(C))")).toEqual([
      "chords 7m7b5(Bm7b5(B3 D4 F4 A4)) 5/7(G/B(G3 B3 D4/B2)) G(G3 B3 D4)",
    ])
    expect(rows("set key D\nset mode minor\nset transpose 2\nprint(chords fifth(1m7))")).toEqual([
      "chords 5m7(Bm7(B3 D4 F#4 A4))",
    ])
  })

  it("shows repeated attacks and repeated-bar values, but never duplicates a held value", () => {
    expect(rows("print(notes 1---1---, chords C -|%|G _)")).toEqual([
      "notes 1(C3) 1(C3)",
      "chords C(C3 E3 G3) C(C3 E3 G3) G(G3 B3 D4)",
    ])
    expect(rows("print(steps x---|^-~-)\nprint(notes -1---)")).toEqual([
      "steps x^~",
      "notes -1(B2)",
    ])
    expect(parseCell("print(chords %|C)").errors[0].msg).toContain("first bar")
  })

  it("shows an empty evaluation for silence without breaking mixed arguments", () => {
    expect(rows("print(notes ----, notes 1---, chords _ _|_, steps ----)")).toEqual([
      "notes [], 1(C3)", "chords []", "steps []",
    ])
  })

  it("does not change what an accompanying play sounds or its duration", () => {
    const baseline = clean("play piano: notes 1---3---")
    const mixed = clean("print(fifth(1))\nplay piano: notes 1---3---\nprint(7)")
    expect(mixed.totalSec).toBe(baseline.totalSec)
    expect(mixed.notes.map((e) => [e.note, e.tick, e.ticks])).toEqual(
      baseline.notes.map((e) => [e.note, e.tick, e.ticks]),
    )
    expect(mixed.outputs).toHaveLength(1)
    expect(mixed.prints.map((p) => p.line)).toEqual([1, 3])
  })

  it("rejects malformed, unbounded and incorrectly typed expressions without partial print output", () => {
    for (const source of [
      "print()",
      "print(1,,3)",
      "print(1,)",
      "print 1",
      "print(fifth(1)",
      "print(1) print(2)",
      "print(missing)",
      "print(0)",
      "print(fifth(1, 100))",
      "print(...1)",
      "print(steps ...x-)",
      "print(128)",
      "print(chords 128)",
      "play block { print(1), }",
      "notes print = 1",
      "chords harmony = C G\nprint(notes harmony)",
      "notes melody = 1\nchords harmony = C\nprint(melody harmony)",
      "print(1)\nprint(missing)",
    ]) {
      const p = parseCell(source)
      expect(p.errors.length, source).toBeGreaterThan(0)
      expect(p.prints, source).toEqual([])
    }
  })

  it("parses multiline calls and highlights their exact source", () => {
    const source =
      "with key D, mode minor {\n print(\n fifth(1 3 5, 2), // more\n chords 1sus2,\n steps 2*x-\n ),\n}"
    clean(source)
    const parts = highlightMusic(source)
    expect(parts.flat().filter((p) => p.c === "tk-error")).toEqual([])
    expect(parts.map((line) => line.map((p) => p.s).join("")).join("\n")).toBe(source)
    expect(Parser.parse("print(1)\nprint(2)").statements.map((s) => s.kind)).toEqual([
      "print",
      "print",
    ])
  })
})

describe("a value on a line of its own", () => {
  it("prints when it is the cell's last statement, as a notebook's last expression does", () => {
    expect(rows("chords 1/3 C/E")).toEqual(["chords 1/3(C/E(C3 E3 G3/E2)) C/E(C3 E3 G3/E2)"])
    expect(rows("notes fifth(1 3 5 7)")).toEqual(["notes 5(G3) 7(B3) 9(D4) 11(F4)"])
    expect(rows("steps 2*(x- ^-)")).toEqual(["steps x^x^"])
    expect(rows("notes melody = 1 3\nmelody")).toEqual(["notes 1(C3) 3(E3)"])
    expect(rows("chords harmony = 1 4\nfifth(harmony) // up a fifth\n")).toEqual([
      "chords 5(G(G3 B3 D4)) 8(C(C4 E4 G4))",
    ])
    expect(rows("set key D\nnotes melody = 1 3\nnotes melody")).toEqual(["notes 1(D3) 3(F#3)"])
  })

  it("is evaluated and shows nothing anywhere else, and print still shows one anywhere", () => {
    expect(rows("chords 1 4\nnotes 1 2")).toEqual(["notes 1(C3) 2(D3)"])
    expect(rows("chords 1 4\nprint(1)\nplay piano: chords 1")).toEqual(["notes 1(C3)"])
    expect(rows("print(1)\nchords 1")).toEqual(["notes 1(C3)", "chords 1(C(C3 E3 G3))"])
    expect(rows("with key D { chords 1, }")).toEqual([])
    const p = clean("play piano: notes 1---\nchords 1 4")
    expect(p.outputs).toHaveLength(1)
    expect(p.prints.map((r) => r.line)).toEqual([2])
  })

  it("reports a mistake in one wherever it is", () => {
    for (const source of [
      "chords missing\nplay piano: chords 1",
      "notes 0",
      "notes melody = 1\nfifth(melody, 100)",
      "notes ...1",
    ]) {
      const p = parseCell(source)
      expect(p.errors.length, source).toBeGreaterThan(0)
      expect(p.prints, source).toEqual([])
    }
  })

  it("leaves what was never a value alone", () => {
    const first = (source: string) => parseCell(source).errors[0]?.msg
    expect(first("1 2 3")).toBeTruthy()
    expect(first("notes riff F---")).toMatch(/notes riff needs = before what it holds/)
    expect(first("steps pair x-x-")).toMatch(/steps pair needs = before what it holds/)
    expect(first("pattern beat = { kick: x---, }\nbeat")).toMatch(/Write play beat/)
    expect(first("piano: chords 1")).toMatch(/goes inside braces/)
  })
})
