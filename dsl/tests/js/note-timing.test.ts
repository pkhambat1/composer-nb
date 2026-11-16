import { describe, expect, it } from "vitest"
import { parseCell } from "../../js/cell.ts"
import { sheetAbc } from "../../js/sheet.ts"
import { gridRows } from "../../js/grid.ts"

const clean = (source: string, state?: Parameters<typeof parseCell>[1]) => {
  const parsed = parseCell(source, state)
  expect(parsed.errors, source).toEqual([])
  return parsed
}
const timing = (events: { tick: number; ticks: number }[]) =>
  events.map(({ tick, ticks }) => [tick, ticks])

describe("notes divide bars like chords", () => {
  it("plays the reported whole-tone phrase across cells with identical timing", () => {
    const above = clean(`set mode wholeTone
set key E
chords harmony = 1 2 3 4 | 5 6 7 8 | 8 7 6 5 | 4 3 2 1
notes melody = 1 2 3 4 | 5 6 7 8 | 8 7 6 5 | 4 3 2 1
print(harmony)`)
    const p = clean("play block { piano: notes melody, guitar: chords harmony }", above.state)
    expect(p.totalSec).toBe(8)
    expect(timing(p.notes)).toEqual(Array.from({ length: 16 }, (_, i) => [i * 96, 96]))
    expect(timing(p.notes)).toEqual(timing(p.chords))
    expect(p.notes.map((e) => e.note.midi)).toEqual(p.chords.map((e) => e.chord.notesMidi[0]))
    expect(sheetAbc(p.blocks[0]).abc).toContain("M:4/4")
  })

  it.each(["1", "1 3", "1 2 3 4", "1 - _ 5", "1 | - - 3 _ | 5 7"])(
    "matches chord onsets and holds for %s",
    (value) => {
      const p = clean(`play block { piano: notes ${value}, guitar: chords ${value} }`)
      expect(timing(p.notes)).toEqual(timing(p.chords))
    },
  )

  it("divides each bar independently in the active meter", () => {
    const p = clean("set time 3 over 4\nplay piano: notes 1 2 3 | 4 5 | 6")
    expect(timing(p.notes)).toEqual([
      [0, 96],
      [96, 96],
      [192, 96],
      [288, 144],
      [432, 144],
      [576, 288],
    ])
    const odd = clean("set time 7 over 8\nplay piano: notes 1 2 3 4 5 6 7")
    expect(timing(odd.notes)).toEqual(Array.from({ length: 7 }, (_, i) => [i * 48, 48]))
  })

  it("shows the same quarter- and half-note durations on the grid and sheet", () => {
    const p = clean("play piano: notes 1 2 3 4 | 5 1")
    expect(sheetAbc(p.blocks[0]).abc).toContain("[V:P1] C,4 D,4 E,4 F,4 | G,8 C,8 |")
    const grid = gridRows(p.blocks[0])
    expect(grid.per).toBe(4)
    expect([...grid.rows[0].cells].filter(([, cell]) => cell.hit).map(([at]) => at)).toEqual([
      0, 1, 2, 3, 4, 6,
    ])
  })

  it("preserves bar boundaries through names, repeats and interval functions", () => {
    const p = clean(`notes phrase = 1 3 | 5 7 8 7
play block { piano: notes 2*(third(phrase) |) }`)
    expect(timing(p.notes)).toEqual([
      [0, 192],
      [192, 192],
      [384, 96],
      [480, 96],
      [576, 96],
      [672, 96],
      [768, 192],
      [960, 192],
      [1152, 96],
      [1248, 96],
      [1344, 96],
      [1440, 96],
    ])
  })

  it("keeps repeated attacks within a bar in repeating patterns", () => {
    const p = clean("play pattern { piano: notes 4*1 } for 2 bars")
    expect(timing(p.notes)).toEqual(Array.from({ length: 8 }, (_, i) => [i * 96, 96]))
    expect(p.notes.map((e) => e.repeat)).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
      true,
      true,
    ])
  })

  it("supports leading silence, holds across loops and fills after the written bars", () => {
    expect(timing(clean("play pattern { piano: notes - 1 } for 2 bars").notes)).toEqual([
      [192, 384],
      [576, 192],
    ])
    expect(timing(clean("play piano: notes 1 3 ...5 for 2 bars").notes)).toEqual([
      [0, 192],
      [192, 192],
      [384, 384],
    ])
    expect(timing(clean("play piano: notes 1 ...- for 2 bars").notes)).toEqual([[0, 768]])
    expect(timing(clean("play piano: notes 1 ..._ for 2 bars").notes)).toEqual([[0, 384]])
    expect(timing(clean("play piano: notes ...5 for 2 bars").notes)).toEqual([[0, 768]])
  })

  it("retains fixed steps with explicit every and restores bar timing outside it", () => {
    const p = clean(`notes riff = 1 2 3 4
play every 1/4 beats piano: notes riff
play piano: notes riff`)
    expect(p.outputs.map((o) => o.durSec)).toEqual([0.5, 2])
    expect(timing(p.outputs[0].notes)).toEqual([
      [0, 24],
      [24, 24],
      [48, 24],
      [72, 24],
    ])
    const triplets = clean("play every 1/3 beats piano: notes 1 2 3")
    expect(timing(triplets.notes)).toEqual([
      [0, 32],
      [32, 32],
      [64, 32],
    ])
    expect(parseCell("play every 1/4 beats piano: notes 1 2 | 3 4").errors[0].msg).toMatch(
      /isn't at the end of a bar/,
    )
  })

  it("rejects unsupported bar divisions and sequences longer than 64 bars", () => {
    for (const type of ["notes", "chords"]) {
      const p = parseCell(`play piano: ${type} 1 2 3`)
      expect(p.errors[0].msg).toMatch(/can't be split evenly into 3/)
      expect(p.outputs).toEqual([])
    }
    expect(parseCell("play piano: notes 65*(1 |)").errors[0].msg).toMatch(/at most 64 bars/)
  })
})
