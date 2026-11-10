import { describe, expect, it } from "vitest"
import { parseCell } from "../../js/cell.ts"
import { highlightMusic } from "../../js/highlight.ts"

const clean = (source: string) => {
  const parsed = parseCell(source)
  expect(parsed.errors, source).toEqual([])
  return parsed
}
const notes = (value: string) => clean(`play piano: notes ${value}`).notes
const timing = (value: string) => notes(value).map((e) => [e.note.midi, e.tick, e.ticks])
const errors = (source: string) => {
  const parsed = parseCell(source)
  expect(parsed.outputs).toEqual([])
  return parsed.errors.map((e) => e.msg).join("\n")
}

describe("note step repeats", () => {
  it("distinguishes held notes, repeated attacks and silent steps", () => {
    expect(timing("1 7*- 3 7*-")).toEqual([
      [48, 0, 192],
      [52, 192, 192],
    ])
    expect(timing("8*1")).toEqual(Array.from({ length: 8 }, (_, i) => [48, i * 24, 24]))
    expect(timing("1 3*- 4*_ 3 7*-")).toEqual([
      [48, 0, 96],
      [52, 192, 192],
    ])
    expect(clean("notes silence = 8*_\nplay piano: notes silence").totalSec).toBe(1)
  })

  it("expands names and nested groups with negative degrees and articulation", () => {
    const source = `notes motif = ^-1 3*- ~3- 2*_
notes phrase = 2*(motif 2*(5- -2-))
play piano: notes phrase`
    const p = clean(source)
    expect(p.notes.map((e) => e.note.midi)).toEqual([
      47, 52, 55, 45, 55, 45, 47, 52, 55, 45, 55, 45,
    ])
    expect(p.notes.filter((e) => e.accent).map((e) => e.tick)).toEqual([0, 384])
    expect(p.notes.filter((e) => e.ghost).map((e) => e.tick)).toEqual([96, 480])
    expect(p.totalSec).toBe(4)
  })

  it("composes repeats with scale functions, their counts and relative notes", () => {
    const p = clean(`set mode minor
notes phrase = 2*(1 7*- 3 7*-)
play piano: notes fifth(phrase, 2)`)
    expect(p.notes.map((e) => [e.note.midi, e.tick, e.ticks])).toEqual([
      [62, 0, 192],
      [65, 192, 192],
      [62, 384, 192],
      [65, 576, 192],
    ])
    expect(timing("2*fifth(1 7*- 3 7*-, 2)")).toEqual([
      [62, 0, 192],
      [65, 192, 192],
      [62, 384, 192],
      [65, 576, 192],
    ])
    expect(timing("2*(fifth(C3, 2) 3*-)")).toEqual([
      [62, 0, 96],
      [62, 96, 96],
    ])
    expect(timing("2*fifth(2*(1--- 3---))")).toHaveLength(8)
    expect(timing("2*1---fifth(3)---")).toEqual([
      [48, 0, 96],
      [59, 96, 96],
      [48, 192, 96],
      [59, 288, 96],
    ])
    expect(timing("2*fifth(1)---3---")).toEqual([
      [55, 0, 96],
      [52, 96, 96],
      [55, 192, 96],
      [52, 288, 96],
    ])
  })

  it("uses the current step length, including triplets", () => {
    const p = clean("play every 1/3 beats { block { piano: notes 1 5*- 3 5*-, } }")
    expect(p.notes.map((e) => [e.tick, e.ticks])).toEqual([
      [0, 192],
      [192, 192],
    ])
    expect(p.totalSec).toBe(2)
    clean("play piano: notes 2*(1 7*- 3 7*- |)")
    expect(errors("play piano: notes 2*(1 3*- |)")).toMatch(/isn't at the end of a bar/)
  })

  it("allows finite repetition but asks pattern lines for their repeating figure once", () => {
    for (const value of ["1---1---", "2*1---", "2*(1---)"]) {
      clean(`play piano: notes ${value}`)
      clean(`play block { piano: notes ${value}, }`)
      clean(`notes phrase = ${value}\nplay piano: notes phrase`)
      expect(errors(`play pattern { piano: notes ${value}, }`)).toMatch(/pattern repeats it/)
    }
    clean("play pattern { piano: notes 1 7*- 3 7*-, }")
  })

  it("fills with a new note, sustain or silence after a finite prefix", () => {
    const fill = (value: string) => clean(`play block { piano: notes ${value}, hat: 16*x, }`).notes
    expect(fill("1 3*- ...-").map((e) => [e.tick, e.ticks])).toEqual([[0, 384]])
    expect(fill("1 3*- ..._").map((e) => [e.tick, e.ticks])).toEqual([[0, 96]])
    expect(fill("1 3*- ...3").map((e) => [e.note.midi, e.tick, e.ticks])).toEqual([
      [48, 0, 96],
      [52, 96, 288],
    ])
    expect(fill("...fifth(-1)")[0].note.midi).toBe(53)
    expect(errors("play piano: notes 2*(1 ..._)")).toMatch(/bounded repeat/)
    expect(errors("play piano: notes fifth(1 ..._)")).toMatch(/outside the function/)
    expect(errors("play piano: notes 1 ..._ 3")).toMatch(/nothing goes after/)
    expect(errors("notes phrase = 1 ..._")).toMatch(/length of their own/)
  })

  it("rejects obsolete durations and comma lists with migration advice", () => {
    for (const value of ["2 beats 1", "8 steps 1", "1 bars rest", "2 beats fifth(1)"])
      expect(errors(`play piano: notes ${value}`)).toMatch(/step words and \* repeats/)
    for (const value of ["rest", "...rest"])
      expect(errors(`play piano: notes ${value}`)).toMatch(/silent note step is _/)
    expect(errors("play piano: notes 1, 3")).toMatch(/spaces/)
    expect(errors("play piano: notes (1 7*- 3 7*-)")).toMatch(/repeat count/)
  })

  it("validates counts, group boundaries, types, depth and expanded size", () => {
    for (const count of ["0", "1", "-2", "2.5", "3/2", "nope", "9007199254740992"])
      expect(errors(`play piano: notes ${count}*1`)).toMatch(/integer of at least 2/)
    expect(errors("play piano: notes 2*()")).toMatch(/at least one word/)
    expect(errors("play piano: notes 2*(1")).toMatch(/missing its/)
    expect(errors("play piano: notes 2*(1)3")).toMatch(/space between/)
    expect(errors("play piano: notes 2*missing")).toMatch(/isn't defined/)
    expect(errors("chords harmony = 1 3\nplay piano: notes 2*harmony")).toMatch(
      /chords.*can't go in notes/,
    )
    expect(errors("play piano: notes 1000000000*1")).toMatch(/at most 64 bars/)
    expect(errors("notes longPhrase = 512*1\nplay piano: notes 3*longPhrase")).toMatch(
      /at most 64 bars/,
    )
    expect(errors(`play piano: notes ${"2*(".repeat(33)}1${")".repeat(33)}`)).toMatch(/32 levels/)
    expect(notes("1024*1")).toHaveLength(1024)
  })

  it("highlights repeats and preserves every source character", () => {
    for (const value of ["2*(^-1--- fifth(3, -1) 3*_) ..._", "...fifth(1)", "2*fifth(C3, 2)"]) {
      const source = `play block { piano: notes ${value}, } for 2 bars`
      clean(source)
      const highlighted = highlightMusic(source).flat()
      expect(highlighted.filter((p) => p.c === "tk-error")).toEqual([])
      expect(highlighted.map((p) => p.s).join("")).toBe(source)
    }
    for (const value of ["2 beats 1", "rest", "1, 3", "(1 3)", "-2*1", "2.5*1", "foo*1"])
      expect(
        highlightMusic(`play piano: notes ${value}`)
          .flat()
          .some((p) => p.c === "tk-error"),
      ).toBe(true)
  })
})
