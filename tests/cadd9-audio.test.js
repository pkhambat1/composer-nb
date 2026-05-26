import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../src/lib/music-engine.js")

describe("Cadd9 audio path", () => {
  it("guitar, no capo: plays C E G D", () => {
    const { chords } = parseSource("@inst guitar\nCadd9")
    const c = chords[0].chord
    const pcs = c.notesMidi.map((m) => ((m % 12) + 12) % 12).sort((a, b) => a - b)
    expect(pcs).toEqual([0, 2, 4, 7]) // C D E G
    expect(c.notesMidi).toContain(62) // explicit D4
  })

  it("guitar with @capo 2: plays D F# A E (transposed)", () => {
    const { chords } = parseSource("@inst guitar\n@capo 2\nCadd9")
    const c = chords[0].chord
    const pcs = c.notesMidi.map((m) => ((m % 12) + 12) % 12).sort((a, b) => a - b)
    expect(pcs).toEqual([2, 4, 6, 9]) // D E F# A
  })
})
