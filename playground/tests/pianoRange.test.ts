import { describe, expect, it } from "vitest"
import { pianoRange } from "../src/notebook/pianoRange.ts"

describe("shared piano range", () => {
  it("uses one reference range for an entire chord row", () => {
    expect(pianoRange([{ notesMidi: [60, 64, 67] }, { notesMidi: [65, 69, 72] }])).toEqual({
      start: 48,
      octaves: 3,
    })
    expect(pianoRange([])).toEqual({ start: 48, octaves: 2 })
  })
  it("includes low slash basses and high extensions without folding pitches", () => {
    const chords = [{ notesMidi: [60, 64, 67, 86], bassMidi: 35 }]
    const range = pianoRange(chords)
    expect(range.start).toBe(24)
    expect(range.start + range.octaves * 12).toBeGreaterThan(86)
  })
})
