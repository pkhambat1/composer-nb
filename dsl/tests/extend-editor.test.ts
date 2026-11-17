import { describe, expect, it } from "vitest"
import { highlightMusic } from "../src/highlight.ts"
import { hoverAt } from "../src/hover.ts"

describe("extend editor support", () => {
  it("documents the chord-only signature even before the call is finished", () => {
    const source = "play piano: chords extend("
    const help = hoverAt(source, 1, source.indexOf("extend") + 1)!
    expect(help.signature).toBe("extend(chart: chords, modifier: suffix) → chords")
    expect(help.description).toContain("Accepts chords only")
    expect(help.page).toBe("functions/extend")
  })

  it("colours nested chart arguments and their suffixes without changing source", () => {
    const source = "print(extend (second(1m7 | 4dom7), maj7add9))"
    const parts = highlightMusic(source).flat()
    expect(parts.map((p) => p.s).join("")).toBe(source)
    const classes = parts.flatMap((p) => [...p.s].map(() => p.c))
    const colour = (token: string) =>
      classes.slice(source.indexOf(token), source.indexOf(token) + token.length)
    expect(colour("extend")).toEqual(Array(6).fill("tk-directive-key"))
    expect(colour("second")).toEqual(Array(6).fill("tk-directive-key"))
    expect(colour("1")).toEqual(["tk-root tk-root-abs"])
    expect(colour("maj")).toEqual(Array(3).fill("tk-quality"))
    expect(colour("add9")).toEqual(Array(4).fill("tk-ext"))
  })

  it("keeps an unfinished extension intact for the editor", () => {
    const source = "play piano: chords extend(1 | 4,"
    expect(
      highlightMusic(source)
        .flat()
        .map((p) => p.s)
        .join(""),
    ).toBe(source)
  })
})
