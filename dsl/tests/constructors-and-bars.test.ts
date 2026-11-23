import { describe, expect, it } from "vitest"
import { parseCell } from "../src/cell.ts"
import { printLayout, printRowText } from "../src/print.ts"
import { highlightMusic } from "../src/highlight.ts"
import { sheetAbc } from "../src/sheet.ts"

const clean = (source: string) => {
  const parsed = parseCell(source)
  expect(parsed.errors, source).toEqual([])
  return parsed
}
const rows = (source: string) => printLayout(clean(source).prints).map(printRowText)

describe("constructed musical values", () => {
  it("voices a ninth above the root octave in print and playback", () => {
    const p = clean(
      "chords inclinationHome = 2m9\nprint(inclinationHome)\nplay({ piano: inclinationHome })",
    )
    expect(printLayout(p.prints).map(printRowText)).toEqual(["chords 2m9 → Dm9 → (D3 F3 A3 C4 E4)"])
    expect(p.chords[0].chord.notesMidi).toEqual([50, 53, 57, 60, 64])
    expect(rows("print(chord(1add9), chord(1sus2))")).toEqual([
      "chords 1add9 → Cadd9 → (C3 E3 G3 D4), 1sus2 → Csus2 → (C3 D3 G3)",
    ])
  })
  it("preserves note/chord types through nested functions and separates arguments", () => {
    expect(rows("print(second(note(1)), second(chord(1)))")).toEqual([
      "notes 2 → D3",
      "chords 2 → Dm → (D3 F3 A3)",
    ])
    expect(
      rows("print(second(second(second(chord(1)))) second(second(second(chord(1)))), chord(5))"),
    ).toEqual(["chords 4 → F → (F3 A3 C4) 4 → F → (F3 A3 C4), 5 → G → (G3 B3 D4)"])
  })
  it("modifies a chord before or after moving it without changing its register", () => {
    expect(rows("print(second(modify(chord(1), sus2)))")).toEqual([
      "chords 2sus2 → Dsus2 → (D3 E3 A3)",
    ])
    expect(rows("print(modify(octave(chord(1)), sus2))")).toEqual([
      "chords 8sus2 → Csus2 → (C4 D4 G4)",
    ])
  })
  it("recognizes the screenshot's altered ninths instead of printing expressions", () => {
    expect(rows("print(chords second(2m9) fourth(2m9) sixth(2m9))")).toEqual([
      "chords 3m7b9 → Em7b9 → (E3 G3 B3 D4 F4) 5dom9 → G9 → (G3 B3 D4 F4 A4) 7m7b5b9 → Bm7b5b9 → (B3 D4 F4 A4 C5)",
    ])
  })
  it("accepts typed expressions and names on instrument lines", () => {
    const p = clean(
      "chords home = 1\nplay({ piano: second(chord(1)), bass: note(1), guitar: second(home) })",
    )
    expect(p.notes.map((e) => e.note.name)).toEqual(["C3"])
    expect(p.chords.map((e) => e.chord.label)).toEqual(["Dm", "Dm"])
  })
  it.each([
    "note()",
    "chord(1, 2)",
    "note(chord(1))",
    "chord(note(1))",
    "modify(note(1), sus2)",
    "modify(chord(1), banana)",
  ])("rejects %s without partial output", (value) => {
    const p = parseCell(`print(${value})`)
    expect(p.errors.length).toBeGreaterThan(0)
    expect(p.prints).toEqual([])
  })
})

describe("padded bars and inline parts", () => {
  it("pads layered drums at exact bar boundaries even with dotted step lengths", () => {
    const p = clean("play(every 3/4 beats { kick: { x | x, ---x } })")
    expect(p.totalSec).toBe(4)
    expect(p.drumEvents.map((e) => e.tick)).toEqual([0, 216, 384, 600])
    const named = clean("steps pickup = x | x\nplay({ kick: { pickup, --x } })")
    expect(named.drumEvents.map((e) => e.tick)).toEqual([0, 48, 384, 432])
    const copied = clean("steps layers = {x, --x}\nsteps copy = layers\nplay({kick: 2*copy})")
    expect(copied.drumEvents.map((e) => e.tick)).toEqual([0, 48, 384, 432])
  })
  it("allows repeated chord charts", () => {
    expect(clean("play(pattern({ piano: chord(1 | 1) }))").chords).toHaveLength(2)
  })
  it("defaults bare bodies to blocks, including nested bodies", () => {
    const a = clean("play({ kick: x--- })")
    const b = clean("play(block({ kick: x--- }))")
    const c = clean("play({ { kick: x--- } })")
    for (const p of [a, b, c]) {
      expect(p.totalSec).toBe(2)
      expect(p.drumEvents.map((e) => e.secStart)).toEqual([0])
    }
  })
  it("pads each pattern line before repeating it", () => {
    const p = clean("play(pattern({ kick: x---, hat: x- })) for 2 bars")
    expect(p.drumEvents.filter((e) => e.lane === "kick").map((e) => e.secStart)).toEqual([0, 2])
    expect(p.drumEvents.filter((e) => e.lane === "hat").map((e) => e.secStart)).toEqual([0, 2])
    expect(clean("play(pattern({ kick: 4*x--- }))").drumEvents).toHaveLength(4)
  })
  it("pads explicit and implicit bar endings with silence without stretching steps", () => {
    const p = clean("play({ kick: x--- | x--- })")
    expect(p.totalSec).toBe(4)
    expect(p.drumEvents.map((e) => e.secStart)).toEqual([0, 2])
    expect(sheetAbc(p.blocks[0]).abc).toContain("z")
    const notes = clean("play(every 1/4 beats piano: note(1 2 | 3))")
    expect(notes.notes.map((e) => [e.tick, e.ticks])).toEqual([
      [0, 24],
      [24, 24],
      [384, 24],
    ])
    expect(notes.totalSec).toBe(4)
  })
  it("pads explicit note bars even when the line ends with a musical fill", () => {
    const p = clean("play(every 1/4 beats 2 bars { piano: note(1 | 2) ...3 })")
    expect(p.notes.map((e) => [e.tick, e.ticks])).toEqual([
      [0, 24],
      [384, 24],
      [408, 360],
    ])
    const tail = clean("play(every 1/4 beats 2 bars { piano: notes 1 | ...3 })")
    expect(tail.notes.map((e) => [e.tick, e.ticks])).toEqual([
      [0, 24],
      [384, 384],
    ])
  })
  it("does not require an integer number of nested repetitions", () => {
    const p = clean(
      "pattern phrase = { kick: x | x | x }\nblock music = 4 bars { phrase }\nplay(music)",
    )
    expect(p.totalSec).toBe(8)
    expect(p.drumEvents.map((e) => e.secStart)).toEqual([0, 2, 4, 6])
  })
  it("allows three equal notes and chords in 4/4", () => {
    const p = clean("play({ piano: notes 1 2 3, guitar: chords 1 2 3 })")
    expect(p.notes.map((e) => [e.tick, e.ticks])).toEqual([
      [0, 128],
      [128, 128],
      [256, 128],
    ])
    expect(p.chords.map((e) => [e.tick, e.ticks])).toEqual([
      [0, 128],
      [128, 128],
      [256, 128],
    ])
    expect(sheetAbc(p.blocks[0]).abc).toContain("M:4/4")
  })
  it("uses the active meter, and keeps block lines one-shot", () => {
    const p = clean("set time 3 over 4\nplay({ kick: x, snare: -x }) for 2 bars")
    expect(p.totalSec).toBe(3)
    expect(p.drumEvents.map((e) => e.secStart)).toEqual([0, 0.125])
  })
  it.each(["play({ kick: x ...- })", "play({ piano: notes 1 ..._ })"])(
    "rejects redundant rest-to-end syntax: %s",
    (source) => {
      expect(parseCell(source).errors[0].msg).toContain("automatically fill with silence")
    },
  )
  it("preserves source and highlights nested constructor syntax", () => {
    const source = "play(pattern({ piano: second(modify(chord(1), sus2)), kick: x---, }))"
    clean(source)
    expect(
      highlightMusic(source)
        .map((line) => line.map((p) => p.s).join(""))
        .join("\n"),
    ).toBe(source)
  })
})
