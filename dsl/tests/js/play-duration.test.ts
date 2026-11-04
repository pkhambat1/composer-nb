import { describe, expect, it } from "vitest"
import { parseCell } from "../../js/language.ts"

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
})
