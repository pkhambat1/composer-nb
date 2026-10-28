/* A 6/9 chord is written as on a lead sheet, C6/9 or Cm6/9, and only that way: its / is the
   chord's own, not a bass, so C6/9/E is C6/9 over E, and 69, 6add9 and maj6/9 aren't chords. */
import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { buildChord, parseKey, isRoman } = await import("../../js/chords.ts")
const { parseSource } = await import("../../js/music-engine.ts")
const { highlightMusic } = await import("../../js/highlight.ts")

const C = parseKey("C")
const notes = (t) => buildChord(t, C).noteNames.map((n) => n.replace(/\d+$/, ""))
const painted = (src) =>
  highlightMusic(src)
    .flat()
    .filter((p) => p.c)
    .map((p) => `${p.c}:${p.s}`)

describe("6/9", () => {
  it("is a 6 chord with the 9th added, major or minor", () => {
    expect(notes("C6/9")).toEqual(["C", "E", "G", "A", "D"])
    expect(notes("Cm6/9")).toEqual(["C", "Eb", "G", "A", "D"])
    expect(buildChord("Cm6/9", C).label).toBe("Cm6/9")
  })

  it("takes a numeral, and a bass after it", () => {
    expect(buildChord("i6/9", C).label).toBe("C6/9")
    expect(buildChord("vi6/9", C).label).toBe("Am6/9")
    expect(buildChord("bvii6/9", C).label).toBe("Bb6/9")
    expect(isRoman("i6/9")).toBe(true)
    const over = buildChord("C6/9/E", C)
    expect([over.label, over.bassName]).toEqual(["C6/9/E", "E2"])
    const p = parseSource("set key C\nplay piano: chords i6/9 vi6/9|v of i6/9 i6/9 of v")
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
    const lib = await import("../../js/chord-lookup.ts")
    await lib.load()
    expect(lib.lookupPosition("C6/9")).toBeTruthy()
    expect(lib.lookupPosition("Cm6/9")).toBeTruthy()
  })

  it("is coloured as a chord, and the other spellings as mistakes", () => {
    expect(painted("play piano: chords C6/9 Cm6/9/E")).toEqual(
      expect.arrayContaining(["tk-ext:6/9", "tk-quality:m", "tk-slash:/", "tk-bass:E"]),
    )
    expect(painted("play piano: chords C6/9")).not.toContain("tk-bass:9")
    expect(painted("play piano: chords C69")).toContain("tk-error:69")
  })
})
