import { describe, expect, it, vi } from "vitest"
import { parseCell } from "../src/cell.ts"
import { printLayout, printRowText } from "../src/print.ts"

vi.mock("tone", () => ({}))

const { buildChord, parseKey, isRoman } = await import("../src/chords.ts")
const { parseSource, playChord } = await import("../src/music-engine.ts")

const clean = (source: string) => {
  const parsed = parseCell(source)
  expect(parsed.errors, source).toEqual([])
  return parsed
}
const sound = (source: string) => {
  const parsed = clean(source)
  return {
    duration: parsed.totalSec,
    chords: parsed.chords.map(({ tick, ticks, chord }) => ({
      tick,
      ticks,
      notes: chord.notesMidi,
    })),
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

/* A 6/9 chord is written as on a lead sheet, C6/9 or Cm6/9, and only that way: its / is the
   chord's own, not a bass, so C6/9/E is C6/9 over E, and 69, 6add9 and maj6/9 aren't chords. */
const C = parseKey("C")
const notes = (t: string) => buildChord(t, C)!.noteNames.map((n) => n.replace(/\d+$/, ""))

describe("6/9", () => {
  it("is a 6 chord with the 9th added, major or minor", () => {
    expect(notes("C6/9")).toEqual(["C", "E", "G", "A", "D"])
    expect(notes("Cm6/9")).toEqual(["C", "Eb", "G", "A", "D"])
    expect(buildChord("Cm6/9", C)!.label).toBe("Cm6/9")
  })

  it("takes a numeral, and a bass after it", () => {
    expect(buildChord("i6/9", C)!.label).toBe("C6/9")
    expect(buildChord("vi6/9", C)!.label).toBe("Am6/9")
    expect(buildChord("bvii6/9", C)!.label).toBe("Bb6/9")
    expect(isRoman("i6/9")).toBe(true)
    const over = buildChord("C6/9/E", C)
    expect([over!.label, over!.bassName]).toEqual(["C6/9/E", "E2"])
    const p = parseSource("set key C\nplay piano: chords 1M6/9 6m6/9|fifth(1) fifth(1M6/9)")
    expect(p.errors).toEqual([])
    expect(p.chords.map((e) => e.chord.label)).toEqual(["C6/9", "Am6/9", "G", "G6/9"])
  })

  it("has one spelling", () => {
    for (const t of ["C69", "Cm69", "C6add9", "CM69", "Cmaj6/9", "imaj6/9", "i69", "C6/9/E/G"]) {
      expect(buildChord(t, C)).toBeNull()
      expect(parseSource(`play piano: chords ${t}`).errors[0].msg).toBe(
        `"${t}" isn't a chord I know`,
      )
    }
  })

  it("has a guitar shape", async () => {
    const lib = await import("../src/chord-lookup.ts")
    await lib.load()
    expect(lib.lookupPosition("C6/9")).toBeTruthy()
    expect(lib.lookupPosition("Cm6/9")).toBeTruthy()
  })
})

// The notes a chord triggers, in the order they sound
function sounded(source: string): string[] {
  const { chords } = parseSource(source)
  const notes: [number, string][] = []
  const synth = {
    triggerAttackRelease: (note: string, _dur: number, at: number) => notes.push([at, note]),
  }
  playChord(synth as never, { ...chords[0], secStart: 0, secDur: 1 } as never)
  return notes.sort((a, b) => a[0] - b[0]).map((n) => n[1])
}

describe("a chord's bass note", () => {
  it("a plain chord sounds its tones and nothing under them", () => {
    expect(sounded("play piano: chords C")).toEqual(["C3", "E3", "G3"])
    expect(sounded("play piano: chords 6m")).toEqual(["A3", "C4", "E4"])
    expect(sounded("play organ: chords Cm7")).toHaveLength(4)
  })

  it("a chord written over a bass sounds that bass first", () => {
    expect(sounded("play piano: chords C/E")).toEqual(["E2", "C3", "E3", "G3"])
    expect(sounded("play piano: chords 1/3")).toEqual(["E2", "C3", "E3", "G3"])
    expect(sounded("play piano: chords fifth(1/3)")[0]).toBe("B2")
  })
})

describe("Cadd9 audio path", () => {
  it("guitar: notes plays C E G D", () => {
    const { chords } = parseSource("play guitar: chords Cadd9")
    const c = chords[0].chord
    const pcs = c.notesMidi.map((m) => ((m % 12) + 12) % 12).sort((a, b) => a - b)
    expect(pcs).toEqual([0, 2, 4, 7]) // C D E G
    expect(c.notesMidi).toContain(62) // explicit D4
  })

  it("guitar, transposed 2: plays D F# A E", () => {
    const { chords } = parseSource("set transpose 2\nplay guitar: chords Cadd9")
    const c = chords[0].chord
    const pcs = c.notesMidi.map((m) => ((m % 12) + 12) % 12).sort((a, b) => a - b)
    expect(pcs).toEqual([2, 4, 6, 9]) // D E F# A
  })
})
