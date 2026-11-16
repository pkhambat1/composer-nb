import { describe, expect, it } from "vitest"
import { parseCell } from "../src/language.ts"

describe("play durations", () => {
  const definition = "pattern groove = { kick: x--- }\n"
  it("accepts postfix durations on names, blocks and sequences", () => {
    for (const music of ["groove", "block { groove }", "(groove groove)"]) {
      const parsed = parseCell(definition + `play ${music} for (1+1) bars`)
      expect(parsed.errors).toEqual([])
      expect(parsed.outputs[0].durSec).toBe(4)
    }
  })
  it("rejects prefix durations and incomplete or duplicated suffixes", () => {
    for (const play of [
      "play 2 bars groove",
      "play 2 bars { kick: x--- }",
      "play groove for 2",
      "play for 2 bars",
      "play groove for 2 bars for 3 bars",
    ]) {
      const parsed = parseCell(definition + play)
      expect(parsed.errors.length, play).toBeGreaterThan(0)
      expect(parsed.outputs, play).toEqual([])
    }
  })

  // A length counts bars of the music it's given to, in the meter and tempo it plays in.
  describe("counts bars of the music's own meter", () => {
    const seven = "with time 7 over 8 { kick: x-------------, }"
    const cases: [string, string, number, string[]][] = [
      ["block with time", `set tempo 120\nplay block { ${seven}, } for 8 bars`, 14, ["8 7 over 8"]],
      [
        "pattern with time",
        `set tempo 120\nplay pattern { ${seven}, } for 8 bars`,
        14,
        ["8 7 over 8"],
      ],
      [
        "a name holding a with",
        `set tempo 120\npattern seven = { ${seven}, }\nplay seven for 8 bars`,
        14,
        ["8 7 over 8"],
      ],
      [
        "a length on the definition",
        `set tempo 120\npattern seven = 8 bars { ${seven}, }\nplay seven`,
        14,
        ["8 7 over 8"],
      ],
      [
        "meters in order, bar by bar",
        `set tempo 120\npattern seven = { ${seven}, }\npattern four = { kick: x---------------, }\nplay (seven four) for 3 bars`,
        5.5,
        ["1 7 over 8", "1 4 over 4", "1 7 over 8"],
      ],
      [
        "set time at the top, as before",
        "set tempo 120\nset time 7 over 8\nplay pattern { kick: x-------------, } for 8 bars",
        14,
        ["8 7 over 8"],
      ],
    ]
    // A tempo of its own is only a speed: its length is in the bars of what it's in.
    cases.push([
      "with tempo, in the outer bars",
      "set tempo 120\nplay block { with tempo 60 { kick: x---------------, }, } for 2 bars",
      4,
      ["1 4 over 4"],
    ])
    for (const [name, source, seconds, bars] of cases) {
      it(name, () => {
        const parsed = parseCell(source)
        expect(parsed.errors).toEqual([])
        expect(parsed.outputs[0].durSec).toBeCloseTo(seconds, 9)
        expect(parsed.outputs[0].blocks.map((b) => `${b.bars} ${b.time}`)).toEqual(bars)
      })
    }
  })
})
