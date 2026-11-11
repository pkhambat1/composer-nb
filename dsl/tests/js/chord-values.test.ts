import { expect, it } from "vitest"
import { parseCell } from "../../js/cell.ts"
import { printLayout, printRowText } from "../../js/print.ts"

const clean = (source: string) => {
  const parsed = parseCell(source)
  expect(parsed.errors, source).toEqual([])
  return parsed
}
const sound = (source: string) => {
  const parsed = clean(source)
  return {
    duration: parsed.totalSec,
    chords: parsed.chords.map(({ tick, ticks, chord }) => ({ tick, ticks, notes: chord.notesMidi })),
  }
}

it("uses a single-chord name and its transformed aliases in the same slots as literals", () => {
  const settings = "set key A\nset mode minor\n"
  const names = "chords home = 1m7\nchords alias = home\nchords away = fifth(alias, -1)\n"
  expect(sound(settings + names + "play piano: chords alias away")).toEqual(
    sound(settings + "play piano: chords 1m7 fifth(1m7, -1)"),
  )
  expect(sound(settings + names + "play piano: chords 3 home away 5dom7")).toEqual(
    sound(settings + "play piano: chords 3 1m7 fifth(1m7, -1) 5dom7"),
  )
})

it("allows a named chord to be struck twice within one bar", () => {
  expect(sound("chords home = C\nplay piano: chords home home")).toEqual(
    sound("play piano: chords C C"),
  )
})

it("preserves explicit separators between single chords", () => {
  expect(sound("chords home = 1\nplay piano: chords home | fifth(home)")).toEqual(
    sound("play piano: chords 1 | fifth(1)"),
  )
  expect(sound("chords home = |1|\nplay piano: chords home 5")).toEqual(
    sound("play piano: chords 1|5"),
  )
})

it("keeps complete charts intact when concatenated, including interval transformations", () => {
  const names = "chords phrase = 1 3|4 5\nchords answer = fifth(phrase)\n"
  expect(sound(names + "play piano: chords phrase answer")).toEqual(
    sound("play piano: chords 1 3|4 5|fifth(1 3)|fifth(4 5)"),
  )
  expect(sound("chords pair = C G\nplay piano: chords pair F Am")).toEqual(
    sound("play piano: chords C G|F Am"),
  )
  const parsed = clean(names + "chords song = phrase answer\nsong")
  expect(parsed.state.words.song.tokens.join(" ")).not.toMatch(/\|\s+\|/)
  expect(printLayout(parsed.prints).map(printRowText)[0]).not.toContain("|")
})

it("preserves single-chord behavior through inherited names, nested functions, and scopes", () => {
  const before = clean("chords home = 1m7\nchords away = fifth(home, -1)")
  const parsed = parseCell(
    "with key A, mode minor { play piano: chords home octave(away) }",
    before.state,
  )
  expect(parsed.errors).toEqual([])
  const literal = clean("with key A, mode minor { play piano: chords 1m7 octave(fifth(1m7, -1)) }")
  expect(parsed.totalSec).toBe(literal.totalSec)
  expect(parsed.chords.map(({ tick, ticks, chord }) => [tick, ticks, chord.notesMidi])).toEqual(
    literal.chords.map(({ tick, ticks, chord }) => [tick, ticks, chord.notesMidi]),
  )
})
