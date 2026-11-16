import { describe, expect, it } from "vitest"
import { documentation, hoverAt } from "../../js/hover.ts"
import { parseCell } from "../../js/cell.ts"
import { KEYWORDS, PARTS, SETTINGS } from "../../js/vocab.ts"

describe("built-in hover documentation", () => {
  it("documents every built-in keyword, setting and instrument with a playable example", () => {
    for (const name of new Set([...KEYWORDS, ...SETTINGS, ...PARTS])) {
      const help = documentation(name)
      expect(help, name).not.toBeNull()
      expect(help!.description, name).not.toBe("")
      expect(parseCell(help!.example).errors, help!.example).toEqual([])
    }
  })

  it("shows the interval signature, direction and scale-relative meaning", () => {
    const help = hoverAt("play piano: notes third(1)", 1, 20)!
    expect(help.signature).toBe("third(value: notes | chords, count: integer = 1) → notes | chords")
    expect(help.description).toContain("2 scale positions")
    expect(help.description).toContain("negative counts move down")
    expect(help.span).toEqual({ line: 1, col: 18, endLine: 1, endCol: 23 })
  })

  it("distinguishes the octave setting from the octave function", () => {
    expect(hoverAt("set octave 4", 1, 6)?.signature).toBe("set octave 3")
    expect(hoverAt("set octave (2 + 2)", 1, 6)?.signature).toBe("set octave 3")
    expect(hoverAt("with key C, octave 4 { play piano: notes octave(1) }", 1, 14)?.signature).toBe(
      "set octave 3",
    )
    expect(hoverAt("play piano: notes octave(1)", 1, 19)?.signature).toContain("octave(value:")
    expect(hoverAt("print(1, octave(1))", 1, 10)?.signature).toContain("octave(value:")
  })

  it("handles instrument variations, nested calls and unfinished source", () => {
    expect(hoverAt("play guitar.electric: notes 1", 1, 14)?.signature).toBe(
      "guitar.electric: notes | chords",
    )
    expect(hoverAt("print(third(fifth(1)))", 1, 14)?.signature).toContain("fifth(value:")
    expect(hoverAt("play piano: notes third(", 1, 20)?.signature).toContain("third(value:")
    expect(hoverAt("// 🎵\r\nprint(third(1))", 2, 8)?.span).toEqual({
      line: 2,
      col: 6,
      endLine: 2,
      endCol: 11,
    })
  })

  it("does not invent help for comments, whitespace, unknown words or identifier fragments", () => {
    for (const [source, column] of [
      ["// third(1)", 4],
      ["thirdish", 3],
      ["3third", 3],
      ["play  piano", 4],
      ["missing", 2],
      ["third(1)", 5],
    ] as const)
      expect(hoverAt(source, 1, column), source).toBeNull()
  })
})
