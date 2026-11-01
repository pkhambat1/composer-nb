import { describe, expect, it } from "vitest"
import { parseCell } from "../../js/language.ts"

describe("explicit blocks", () => {
  it("does not register untyped declarations", () => {
    const parsed = parseCell("beat = { kick: x- }")
    expect(parsed.errors.length).toBeGreaterThan(0)
    expect(parsed.state.sections.beat).toBeUndefined()
    expect(parsed.state.words.beat).toBeUndefined()
  })
  it("plays block lines once while pattern lines repeat, regardless of sibling order", () => {
    for (const lines of ["one\nlooped", "looped\none"]) {
      const parsed = parseCell(
        `block one = { kick: x- }
pattern looped = { snare: ---x }
play {
${lines}
} for 2 bars`,
      )
      expect(parsed.errors).toEqual([])
      expect(parsed.drumEvents.filter((event) => event.lane === "kick")).toHaveLength(1)
      expect(parsed.drumEvents.filter((event) => event.lane === "snare")).toHaveLength(8)
    }
  })
  it("keeps a block nonrepeating inside a pattern", () => {
    const parsed = parseCell(
      "block accent = { crash: x- }\npattern groove = {\n accent\n kick: x---\n}\nplay groove for 2 bars",
    )
    expect(parsed.errors).toEqual([])
    expect(parsed.state.sections.accent.type).toBe("block")
    expect(parsed.drumEvents.filter((event) => event.lane === "crash")).toHaveLength(1)
  })
  it("pads a longer play with silence rather than repeating a block", () => {
    const parsed = parseCell("block once = { kick: x- }\nplay once for 4 bars")
    expect(parsed.errors).toEqual([])
    expect(parsed.drumEvents.filter((event) => event.lane === "kick")).toHaveLength(1)
  })
})
