import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../src/lib/music-engine.js")

describe("@capo", () => {
  it("transposes notes up N semis on guitar but keeps shape label", () => {
    const { chords, errors } = parseSource("@inst guitar\n@capo 6\nC")
    expect(errors).toEqual([])
    const c = chords[0].chord
    expect(c.label).toMatch(/^C/)
    const pcs = c.notesMidi.map((m) => ((m % 12) + 12) % 12).sort((a, b) => a - b)
    // C shape (C, E, G = 0,4,7) shifted +6 → F#, A#, C# = 6, 10, 1
    expect(pcs).toEqual([1, 6, 10])
    expect(c.noteNames.every((n) => /^(F#|A#|C#)/.test(n))).toBe(true)
  })

  it("warns and does not transpose when inst is not guitar", () => {
    const { chords, errors } = parseSource("@inst piano\n@capo 6\nC")
    expect(errors.length).toBe(1)
    expect(errors[0].msg).toMatch(/guitar/)
    const pcs = chords[0].chord.notesMidi.map((m) => ((m % 12) + 12) % 12).sort((a, b) => a - b)
    expect(pcs).toEqual([0, 4, 7])
  })

  it("rejects out-of-range capo values", () => {
    const { errors } = parseSource("@inst guitar\n@capo 99\nC")
    expect(errors.some((e) => /0–12/.test(e.msg))).toBe(true)
  })

  it("no-op when capo is 0 on guitar", () => {
    const { chords } = parseSource("@inst guitar\n@capo 0\nC")
    const pcs = chords[0].chord.notesMidi.map((m) => ((m % 12) + 12) % 12).sort((a, b) => a - b)
    expect(pcs).toEqual([0, 4, 7])
  })
})
