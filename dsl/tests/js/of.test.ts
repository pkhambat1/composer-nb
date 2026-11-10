import { describe, expect, it } from "vitest"
import { parseCell } from "../../js/cell.ts"
import { highlightMusic } from "../../js/highlight.ts"
import { KEYWORDS } from "../../js/vocab.ts"

describe("retired of operator", () => {
  it.each([
    "play piano: notes 5 of 5",
    "play piano: chords 5 of 5",
    "notes phrase = v of (v of C3)---",
    "chords harmony = 5dom7 of (5 of 5)",
    "print(notes 5 of C3)",
    "print(chords fifth(5 of 5))",
    "notes 5 of 5",
    "chords 5 of 5",
    "pattern unused = { piano: notes 5 of C3, }",
    "with key D { print(chords v of Am), }",
    "play block { piano: notes 2*(5 of C3 3*-), }",
    "play (verse of chorus)",
  ])("rejects %s with interval-function guidance", (source) => {
    const parsed = parseCell(source)
    expect(parsed.errors).toHaveLength(1)
    expect(parsed.errors[0].msg).toMatch(/of.*no longer supported.*fifth\(5\)/)
    expect(parsed.outputs).toEqual([])
    expect(parsed.prints).toEqual([])
  })

  it("reports the original line and leaves inherited state alone", () => {
    const inherited = parseCell("set key D\nnotes riff = 1---").state
    const parsed = parseCell("set key A\nprint(notes fifth(1))\nnotes 5 of 5", inherited)
    expect(parsed.errors[0].line).toBe(3)
    expect(parsed.state.key).toBe(inherited.key)
    expect(parsed.prints).toEqual([])
  })

  it("allows comments and names containing those letters", () => {
    const parsed = parseCell("// fifth of a fifth\nnotes offbeat = fifth(1, 2)---\nprint(offbeat)\noffbeat")
    expect(parsed.errors).toEqual([])
    expect(parsed.prints).toHaveLength(2)
  })

  it("marks the retired operator as an error and removes it from keywords", () => {
    for (const source of ["notes 5 of 5", "chords 5 of 5", "print(chords fifth(5 of 5))"]) {
      const parts = highlightMusic(source).flat()
      expect(parts.some((part) => part.c === "tk-error" && part.s === "of")).toBe(true)
      expect(parts.map((part) => part.s).join("")).toBe(source)
    }
    expect(KEYWORDS).not.toContain("of")
  })
})
