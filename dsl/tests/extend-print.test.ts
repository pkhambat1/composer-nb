import { describe, expect, it } from "vitest"
import { parseCell } from "../src/cell.ts"
import { printedItems } from "../src/print.ts"

const clean = (source: string) => {
  const parsed = parseCell(source)
  expect(parsed.errors, source).toEqual([])
  return parsed
}
const items = (source: string) =>
  clean(source).prints.flatMap((output) => output.values.flatMap(printedItems))

describe("printing extended charts", () => {
  it("infers chords for named and inline charts without creating playback", () => {
    const parsed = clean(
      "chords chart = 1 4 | 5\nprint(extend(chart, maj7), extend(1 4 | 5, maj7))",
    )
    const [named, inline] = parsed.prints[0].values
    expect(named.type).toBe("chords")
    expect(inline.type).toBe("chords")
    expect(named.items).toEqual(inline.items)
    expect(printedItems(named).map((item) => item.tones)).toEqual([
      ["C3", "E3", "G3", "B3"],
      ["F3", "A3", "C4", "E4"],
      ["G3", "B3", "D4", "F#4"],
    ])
    expect(parsed.events).toEqual([])
    expect(parsed.outputs).toEqual([])
    expect(parsed.totalSec).toBe(0)
  })

  it("prints named and inline extensions as bare final expressions", () => {
    expect(items("chords chart = 1 4\nextend(chart, m7)")).toEqual(items("extend(1 4, m7)"))
    expect(items("extend(1 4, m7)").map((item) => item.text)).toEqual(["1m7", "4m7"])
  })

  it("keeps operation order when intervals and quality changes are nested", () => {
    const [moveLast, extendLast] = items("print(fifth(extend(1, maj7)), extend(fifth(1), maj7))")
    expect(moveLast).toMatchObject({
      text: "5dom7",
      tones: ["G3", "B3", "D4", "F4"],
    })
    expect(extendLast).toMatchObject({
      text: "5maj7",
      tones: ["G3", "B3", "D4", "F#4"],
    })
  })

  it("shows additive extensions without losing the original minor seventh", () => {
    const [chord] = items("print(extend(1m7, add9))")
    expect(chord.tones).toEqual(["C3", "Eb3", "G3", "Bb3", "D4"])
    expect(chord.text).toMatch(/^1/)
    expect(chord.text).not.toContain("extend")
  })

  it("prints equivalent composed additions even when their symbols order tones differently", () => {
    const [thirteenthFirst, ninthFirst] = items("print(extend(1, add13add9), extend(1, add9add13))")
    expect(thirteenthFirst).toMatchObject({ text: "1add9add13", chord: "Cadd9add13" })
    expect(ninthFirst).toMatchObject({ text: "1add9add13", chord: "Cadd9add13" })
    expect([...thirteenthFirst.tones!].sort()).toEqual([...ninthFirst.tones!].sort())
    expect(thirteenthFirst.tones).toEqual(["C3", "E3", "G3", "D4", "A4"])
  })

  it("retains bass degrees and reports transpose separately from the written chord", () => {
    const [chord] = items("set transpose 2\nprint(extend(fifth(1/3), maj7))")
    expect(chord).toMatchObject({
      text: "5maj7/7",
      tones: ["G3", "B3", "D4", "F#4"],
      bass: "B2",
      sounding: ["A3", "C#4", "E4", "G#4"],
      soundingBass: "C#3",
    })
  })

  it("reports extension errors without emitting partial print output", () => {
    for (const [source, expected] of [
      ["print(extend(1))", /extend takes a chord chart/],
      ["extend(1)", /extend takes a chord chart/],
      ["print(extend(1, maj7, m7))", /extend takes a chord chart/],
      ["print(extend(1, unknown))", /isn't a chord suffix/],
      ["notes melody = 1 3\nprint(extend(melody, maj7))", /notes/],
      ["steps rhythm = x---\nextend(rhythm, maj7)", /steps/],
    ] as const) {
      const parsed = parseCell(source)
      expect(parsed.errors.length, source).toBeGreaterThan(0)
      expect(parsed.errors[0].msg, source).toMatch(expected)
      expect(parsed.prints, source).toEqual([])
    }
  })
})
