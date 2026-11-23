import { describe, expect, it, vi } from "vitest"
import { parseCell } from "../src/cell.ts"
import { printLayout, printRowText } from "../src/print.ts"
import { Lexer } from "../src/lexer.ts"
import { Parser } from "../src/parser.ts"
import { highlightMusic } from "../src/highlight.ts"
import { unlocated } from "../src/diagnostics.ts"

vi.mock("tone", () => ({}))
const { playChord } = await import("../src/music-engine.ts")

const clean = (source: string) => {
  const parsed = parseCell(source)
  expect(parsed.errors, source).toEqual([])
  return parsed
}
const chord = (value: string) => clean(`play({ piano: ${value} })`).chords[0].chord
const row = (value: string) => printLayout(clean(`print(${value})`).prints).map(printRowText)

describe("voice", () => {
  it("moves the fifth of Dm9 without duplicating it or changing its harmony", () => {
    const p = clean("chords home = voice(2m9, { fifth: 1 })\nprint(home)\nplay({ piano: home })")
    expect(p.chords[0].chord.notesMidi).toEqual([50, 53, 60, 64, 69])
    expect(p.chords[0].label).toBe("Dm9")
    expect(printLayout(p.prints).map(printRowText)).toEqual(["chords 2m9 → Dm9 → (D3 F3 C4 E4 A4)"])
  })
  it("shifts multiple roles simultaneously and supports negative shifts", () => {
    expect(chord("voice(1M6, { fifth: 1, sixth: 1 })").noteNames).toEqual(["C3", "E3", "G4", "A4"])
    expect(chord("voice(1maj9, { third: -1, fifth: 1 })").noteNames).toEqual([
      "E2",
      "C3",
      "B3",
      "D4",
      "G4",
    ])
    expect(chord("voice(1maj9, {})").notesMidi).toEqual(chord("chord(1maj9)").notesMidi)
  })
  it("keeps an explicit slash bass unchanged, including when shifting the root or third", () => {
    const c = chord("voice(Cmaj9/3, { fifth: 1 })")
    expect(c.label).toBe("Cmaj9/E")
    expect(c.bassName).toBe("E2")
    expect(c.noteNames).toEqual(["C3", "E3", "B3", "D4", "G4"])
    const moved = chord("voice(Cmaj9/3, { root: 1, third: -1 })")
    expect(moved.bassName).toBe("E2")
    expect(moved.noteNames).toEqual(["E2", "G3", "B3", "C4", "D4"])
  })
  it("identifies tones by chord role rather than key degree or array index", () => {
    expect(chord("voice(7m7b5, { fifth: 1 })").noteNames).toEqual(["B3", "D4", "A4", "F5"])
    expect(chord("voice(1sus2, { second: 1 })").noteNames).toEqual(["C3", "G3", "D4"])
    expect(chord("voice(1add9, { ninth: -1 })").noteNames).toEqual(["C3", "D3", "E3", "G3"])
    expect(chord("voice(voice(1maj9, { root: 1 }), { fifth: 1 })").noteNames).toEqual([
      "E3",
      "B3",
      "C4",
      "D4",
      "G4",
    ])
  })
  it("composes with interval functions and cumulative voicing calls", () => {
    const a = chord("second(voice(2m9, { fifth: 1 }))")
    const b = chord("voice(second(2m9), { fifth: 1 })")
    expect(a.noteNames).toEqual(b.noteNames)
    expect(a.label).toBe("Em7b9")
    expect(row("second(voice(2m9, { fifth: 1 }))")).toEqual([
      "chords 3m7b9 → Em7b9 → (E3 G3 D4 F4 B4)",
    ])
    expect(chord("voice(voice(2m9, { fifth: 1 }), { fifth: -1 })").noteNames).toEqual([
      "D3",
      "F3",
      "A3",
      "C4",
      "E4",
    ])
    expect(chord("octave(voice(2m9, { fifth: 1 }))").noteNames).toEqual([
      "D4",
      "F4",
      "C5",
      "E5",
      "A5",
    ])
  })
  it("retains voicing when modifying the harmony", () => {
    expect(chord("modify(voice(1, { fifth: 1 }), add9)").noteNames).toEqual([
      "C3",
      "E3",
      "D4",
      "G4",
    ])
    expect(chord("modify(voice(1, { root: 1 }), sus2)").noteNames).toEqual(["D3", "G3", "C4"])
  })
  it("resolves declared charts under the active key, octave and transpose", () => {
    const p = clean(
      "chords home = voice(2m9, { fifth: 1 })\nwith key D, octave 4, transpose 2 { play({ piano: home }) }",
    )
    expect(p.chords[0].chord.notesMidi).toEqual([66, 69, 76, 80, 85])
    const chart = clean("chords chart = 1maj9 | 4maj9\nplay({piano: voice(chart, { fifth: 1 })})")
    expect(chart.chords.map((e) => e.tick)).toEqual([0, 384])
    expect(chart.chords.map((e) => e.chord.noteNames.at(-1))).toEqual(["G4", "C5"])
  })
  it("sends the selected pitches to the instrument's audio voice", () => {
    const p = clean("play({ piano: voice(2m9, { fifth: 1 }) })")
    const triggerAttackRelease = vi.fn()
    playChord({ triggerAttackRelease } as unknown as Parameters<typeof playChord>[0], p.chords[0])
    expect(triggerAttackRelease.mock.calls.map((c) => c[0])).toEqual(["D3", "F3", "C4", "E4", "A4"])
  })
  it("keeps objects, comments and multiline layout intact inside musical bodies", () => {
    const source = `chords home = voice(1M6, {
  fifth: 1, // the fifth moves
  sixth: 1,
})
play({ piano: voice(home, { root: -1 }), kick: x })
print(voice(home, { root: 1 }), voice(2m9, {}))`
    clean(source)
    expect(Parser.parse(source).errors).toEqual([])
    expect(
      Lexer.tokens(source)
        .map((t) => t.text)
        .join(""),
    ).toBe(source)
    expect(
      highlightMusic(source)
        .map((line) => line.map((t) => t.s).join(""))
        .join("\n"),
    ).toBe(source)
    expect(row("voice(2m9, { fifth: 1 }), chord(5)")[0]).toContain("(D3 F3 C4 E4 A4), 5 → G")
  })
  it.each([
    ["voice(2m9)", /octave-shift object/],
    ["voice(2m9, fifth: 1)", /octave-shift object/],
    ["voice(2m9, { fifth: 0.5 })", /integer number/],
    ["voice(2m9, { fifth: 1, fifth: 2 })", /more than once/],
    ["voice(2m9, { banana: 1 })", /Unknown chord tone/],
    ["voice(2m9, { sixth: 1 })", /no sixth/],
    ["voice(2m9, { sixth: 0 })", /no sixth/],
    ["voice(1sus2, { ninth: 1 })", /no ninth/],
    ["voice(1, { fifth: 10 })", /outside playable MIDI/],
    ["voice(1, { root: -10 })", /outside playable MIDI/],
    ["voice(1, { root: 9007199254740992 })", /integer from/],
    ["voice(note(1), { root: 1 })", /notes, not chords/],
    ["voice(2m9, { fifth: 1,, sixth: 1 })", /Each voice shift/],
    ["voice(2m9, { fifth: { octave: 1 } })", /Each voice shift/],
    ["modify(voice(1, { third: 1 }), sus2)", /no third/],
  ])("rejects %s with a located error and no partial output", (value, error) => {
    unlocated.length = 0
    const p = parseCell(`print(${value})`)
    expect(p.errors.map((e) => e.msg).join("\n")).toMatch(error)
    expect(p.prints).toEqual([])
    expect(p.outputs).toEqual([])
    expect(unlocated).toEqual([])
    expect(p.errors.every((e) => e.endLine > e.line || e.endCol > e.col)).toBe(true)
  })
})
