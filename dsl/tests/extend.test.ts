import { describe, expect, it } from "vitest"
import { parseCell } from "../src/cell.ts"
import { unlocated } from "../src/diagnostics.ts"
import { sheetAbc } from "../src/sheet.ts"

function clean(source: string) {
  const parsed = parseCell(source)
  expect(parsed.errors, source).toEqual([])
  return parsed
}
const play = (chart: string, settings = "") => clean(`${settings}\nplay piano: chords ${chart}`)
const tones = (chart: string, settings = "") =>
  play(chart, settings).chords.map((event) => event.chord.noteNames)

// These assertions cover the public DSL, rather than repeating the helper's parsing.
describe("extend(chart, modifier)", () => {
  it("broadcasts one quality over a named chart without mutating its source", () => {
    const result = clean(`
chords cadence = 2m7 | 5dom7 | 1maj7
chords color = extend(cadence, add9)
play piano: chords color
play piano: chords cadence
`)
    expect(result.chords.map((event) => event.chord.noteNames)).toEqual([
      ["D3", "F3", "A3", "C4", "E4"],
      ["G3", "B3", "D4", "F4", "A4"],
      ["C3", "E3", "G3", "B3", "D4"],
      ["D3", "F3", "A3", "C4"],
      ["G3", "B3", "D4", "F4"],
      ["C3", "E3", "G3", "B3"],
    ])
    expect(result.chords.map((event) => event.ticks)).toEqual(Array(6).fill(384))
  })

  it("distinguishes setting a quality from adding to the existing harmony", () => {
    expect(tones("extend(1 2 5 7, maj7)")).toEqual([
      ["C3", "E3", "G3", "B3"],
      ["D3", "F#3", "A3", "C#4"],
      ["G3", "B3", "D4", "F#4"],
      ["B3", "D#4", "F#4", "A#4"],
    ])
    expect(tones("extend(1 2 5 7, add9)")).toEqual([
      ["C3", "E3", "G3", "D4"],
      ["D3", "F3", "A3", "E4"],
      ["G3", "B3", "D4", "A4"],
      ["B3", "D4", "F4", "C#5"],
    ])
    expect(tones("extend(2m7, maj7add9)")).toEqual(tones("2maj7add9"))
    expect(tones("extend(extend(2m7, add9), #11)")).toEqual(tones("2m7add9#11"))
  })

  it("uses the same suspension replacement as literal suffixes", () => {
    expect(tones("extend(1add4, sus2)")).toEqual(tones("1add4sus2"))
    expect(tones("extend(1m7add2add11, sus4)")).toEqual([
      ["C3", "F3", "G3", "Bb3", "F4"],
    ])
  })

  it("retains holds, rests, bar boundaries and argument-local repeated bars", () => {
    const source = "1 - _ 4 | % | 5"
    const result = play(`extend(${source}, add9)`)
    const literal = play("1add9 - _ 4add9 | % | 5add9")
    const events = (parsed: ReturnType<typeof parseCell>) =>
      parsed.chords.map((event) => [event.tick, event.ticks, event.chord.noteNames])
    expect(events(result)).toEqual(events(literal))
    const named = play("6 extend(chart, add9) 3", "chords chart = 1 - _ 4 | 5")
    expect(named.chords.map((event) => event.tick)).toEqual([0, 384, 672, 768, 1152])
  })

  it("resolves degrees in the key and mode at use, including a later cell", () => {
    const definitions = clean("chords chart = 1 2 5 7\nchords color = extend(chart, add9)")
    const result = parseCell(
      "set key D\nset mode dorian\nplay piano: chords color",
      definitions.state,
    )
    expect(result.errors).toEqual([])
    expect(result.chords.map((event) => event.chord.noteNames)).toEqual(
      tones("extend(1 2 5 7, add9)", "set key D\nset mode dorian"),
    )
    expect(result.chords[0].chord.noteNames).toEqual(["D3", "F3", "A3", "E4"])
  })

  it("applies nested functions in written order and preserves a moved slash bass", () => {
    expect(tones("extend(fifth(1), maj7)")).toEqual([["G3", "B3", "D4", "F#4"]])
    expect(tones("fifth(extend(1, maj7))")).toEqual([["G3", "B3", "D4", "F4"]])
    const result = play("extend(octave(1/3), maj7)").chords[0].chord
    expect(result.noteNames).toEqual(["C4", "E4", "G4", "B4"])
    expect(result.bassName).toBe("E3")
    expect(result.overBass).toBe(true)
    const transposed = play("extend(octave(1/3), maj7)", "set transpose 2").chords[0].chord
    expect(transposed.notesMidi).toEqual(result.notesMidi.map((midi) => midi + 2))
    expect(transposed.bassMidi).toBe(result.bassMidi + 2)
    expect(transposed.label).toBe(result.label)
  })

  it("accepts spaces before parentheses and produces playable, printable chords", () => {
    const result = play("extend (third (1 2), add9)")
    expect(result.chords.map((event) => event.chord.noteNames)).toEqual([
      ["E3", "G3", "B3", "F#4"],
      ["F3", "A3", "C4", "G4"],
    ])
    expect(sheetAbc(result.outputs[0].blocks[0]).abc).toContain("Emadd9")
  })

  it.each([
    ["play piano: chords extend(1)", /takes a chord chart and one suffix/],
    ["play piano: chords extend(1,)", /takes a chord chart and one suffix/],
    ["play piano: chords extend(, maj7)", /takes a chord chart and one suffix/],
    ["play piano: chords extend(1, maj7, add9)", /one suffix/],
    ["play piano: chords extend(1, maj7 add9)", /isn't a chord suffix/],
    ["play piano: chords extend(1, [maj7, m7])", /one suffix/],
    ["play piano: chords extend(1, banana)", /isn't a chord suffix/],
    ["play piano: chords extend(1, Cmaj7)", /isn't a chord suffix/],
    ["play piano: chords extend(1, add99)", /isn't a chord suffix/],
    ["play piano: chords extend(1, maj7", /closing/],
    ["play piano: chords extend(1, maj7)x", /closing/],
    ["play piano: chords ^extend(1, maj7)", /closing/],
    ["play piano: notes extend(1, maj7)", /takes and returns chords/],
    ["notes line = extend(1, maj7)", /takes and returns chords/],
    ["notes roots = C D\nplay piano: chords extend(roots, maj7)", /notes/],
    ["steps beat = x-\nplay piano: chords extend(beat, maj7)", /steps/],
    ["play piano: chords extend(missing, maj7)", /isn't defined/],
    ["play piano: chords extend(% | 1, maj7)", /preceding bar/],
    ["chords extend = 1", /already means something/],
    ["play piano: chords extend(octave(7, 5), maj7)", /outside playable/],
  ])("rejects invalid input with a located error: %s", (source, message) => {
    unlocated.length = 0
    const result = parseCell(source)
    expect(result.errors.map((error) => error.msg).join("\n")).toMatch(message)
    expect(result.outputs).toEqual([])
    expect(unlocated).toEqual([])
  })

  it("bounds nested calls", () => {
    const chart = "extend(".repeat(34) + "1" + ", add9)".repeat(34)
    expect(parseCell(`play piano: chords ${chart}`).errors[0].msg).toMatch(/at most 32/)
  })
})
