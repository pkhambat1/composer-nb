/* The editor colours the source on every keystroke, while it renders, so a cell that is half
   typed has to be coloured too: highlightMusic never throws, and it keeps every character,
   because its layer sits over the textarea and has to line up with it. The cells are the
   library's, with each character in turn deleted, which is the state a cell passes through
   when someone edits it, and with a line break or a carriage return put in its place. */
import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { highlightMusic } = await import("../../js/highlight.js")
const { GROOVES } = await import("../../js/grooves.js")

const text = (src) =>
  highlightMusic(src)
    .map((parts) => parts.map((p) => p.s).join(""))
    .join("\n")

const painted = (src, word) =>
  highlightMusic(src)
    .flat()
    .filter((p) => p.s === word)
    .map((p) => p.c)

describe("a cell that is half typed", () => {
  it("is coloured, and its text kept, whichever character is missing", () => {
    const broken = []
    for (const { title, source } of GROOVES) {
      for (let i = 0; i < source.length; i++) {
        const cut = source.slice(0, i) + source.slice(i + 1)
        try {
          if (text(cut) !== cut) broken.push(`${title}: lost text without character ${i}`)
        } catch (e) {
          broken.push(
            `${title}: ${e.message} without character ${i} (${JSON.stringify(cut.slice(Math.max(0, i - 12), i + 12))})`,
          )
        }
      }
    }
    expect(broken).toEqual([])
  })

  it("is coloured, and its text kept, with a break or a carriage return in the way", () => {
    const broken = []
    for (const { title, source } of GROOVES) {
      for (let i = 0; i < source.length; i += 3) {
        for (const mark of ["\r", "\n", "{", "}", "("]) {
          const cut = source.slice(0, i) + mark + source.slice(i + 1)
          try {
            if (text(cut) !== cut) broken.push(`${title}: lost text at ${i}`)
          } catch (e) {
            broken.push(`${title}: ${e.message} at ${i} for ${JSON.stringify(mark)}`)
          }
        }
      }
    }
    expect(broken).toEqual([])
  })

  it("paints a bar with no number as the mistake it is, and goes on", () => {
    // Selecting the 2 of "bar 2 {" and deleting it, or writing bars for bar
    for (const word of ["bar", "bars"]) {
      const src = `play {\n  ${word} {\n    kick: x---\n  }\n}`
      expect(painted(src, word)).toEqual(["tk-error"])
      expect(text(src)).toBe(src)
    }
    expect(painted("play {\n  bar 2 {\n    kick: x---\n  }\n}", "bar")).toEqual([
      "tk-directive-key",
    ])
  })

  it("reads a line that ends in a carriage return as it reads one that doesn't", () => {
    const colours = (src) => highlightMusic(src).map((parts) => parts.map((p) => p.c))
    const lf = "play {\n  bar 2 {\n    kick: x---\n  }\n}\nset key Am\nsong = { kick: x }"
    const crlf = lf.replace(/\n/g, "\r\n")
    expect(text(crlf)).toBe(crlf)
    expect(colours(crlf).map((line) => line.filter((c) => c === "tk-error").length)).toEqual(
      colours(lf).map((line) => line.filter((c) => c === "tk-error").length),
    )
  })
})
