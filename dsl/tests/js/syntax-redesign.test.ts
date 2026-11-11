import { describe, expect, it } from "vitest"
import { parseCell } from "../../js/cell.ts"
import { Lexer } from "../../js/lexer.ts"
import { Parser } from "../../js/parser.ts"
import { highlightMusic } from "../../js/highlight.ts"

const clean = (source: string) => {
  const parsed = parseCell(source)
  expect(parsed.errors, source).toEqual([])
  return parsed
}
const errors = (source: string) =>
  parseCell(source)
    .errors.map((e) => e.msg)
    .join("\n")
const hits = (source: string, lane = "kick") =>
  clean(source)
    .drumEvents.filter((e) => e.lane === lane)
    .map((e) => e.secStart)

describe("comma entries", () => {
  it("separates entries while newlines within braces remain layout", () => {
    const single = "play block { kick: x- --^, snare: ----x--- }"
    const wrapped = "play block {\n kick: x-\n --^,\n snare: ----x---\n}"
    expect(hits(wrapped)).toEqual(hits(single))
    expect(hits(wrapped, "snare")).toEqual(hits(single, "snare"))
    clean("with tempo 90 { steps aa = x-, play block { kick: aa }, play block { snare: --x } }")
    clean("play block { (\n block { kick: x- }\n block { snare: --x }\n) }")
  })

  it("requires commas, accepts trailing commas, and rejects empty entries and semicolons", () => {
    expect(errors("play block { kick: x-\n snare: --x }")).toMatch(/comma/)
    for (const value of [", kick: x-", "kick: x-,, snare: --x", "kick: x-, ,"]) {
      expect(errors(`play block { ${value} }`)).toMatch(/comma/)
    }
    expect(errors("set tempo 90; play block { kick: x- }")).toMatch(/own line/)
    expect(errors("play block { kick: x-; snare: --x; }")).toMatch(/commas.*semicolons/)
    expect(hits("play block { kick: x-, // tail\n }")).toEqual(hits("play block { kick: x- }"))
    clean("set tempo 90\nplay block { kick: x- }")
    for (const source of [
      "play block { kick: x-; }",
      "play block { block { kick: x- } block { snare: x }, hat: x }",
      "block bad = { block { kick: x- } block { snare: x }, hat: x }\nplay bad",
    ])
      expect(parseCell(source).outputs).toEqual([])
  })

  it("keeps settings and phrase commas scoped to their own expressions", () => {
    const p = clean(`play block {
      piano: notes 1 7*- fifth(2, 2) 7*-,
      with key D, mode minor { bass: notes -1---, },
      hat: { x-, --^, },
    }`)
    expect(p.notes.filter((n) => n.instrument === "piano").map((n) => n.note.midi)).toEqual([
      48, 64,
    ])
    expect(p.notes.find((n) => n.instrument === "bass")?.note.midi).toBe(48)
    clean(`notes minorBass = 1---5---
chords minorChanges = 1 4|7 3
pattern minorCircle = {
  piano: chords minorChanges,
  with octave 2 { bass: notes minorBass, },
  hat: ~-x-,
  snare.cross: 4*- x 3*-,
  kick: x 7*-,
}
play minorCircle`)
  })

  it("keeps original source spans and entry line numbers", () => {
    const source = "play block {\n kick: x-, // first\n snare: --x\n}"
    const tokens = Lexer.tokens(source)
    expect(tokens.map((t) => t.text).join("")).toBe(source)
    for (let i = 1; i < tokens.length; i++) {
      expect([tokens[i].span.line, tokens[i].span.col]).toEqual([
        tokens[i - 1].span.endLine,
        tokens[i - 1].span.endCol,
      ])
    }
    const block = Parser.parse(source).statements[0].parts.find((p) => p.kind === "block")!
    expect(block.statements.map((s) => s.span.line)).toEqual([2, 3])
    expect(parseCell("play block {\n kick: x-,\n snare: nope\n}").errors[0].line).toBe(3)
    expect(Parser.parse("play block { kick: x-\n snare: --x }").errors).toContainEqual({
      code: "separator.missing",
      span: { line: 2, col: 1, endLine: 2, endCol: 7 },
    })
    expect(
      clean("with tempo 90 { play block { kick: x- }, play block { snare: --x } }").outputs.map(
        (o) => o.label,
      ),
    ).toEqual(["play block { kick: x- }", "play block { snare: --x }"])
  })
})

describe("step words and finite repeats", () => {
  it("expands words, names, and nested bounded sequences in a block", () => {
    expect(hits("play block { kick: 2*(x- 3*(-- ^-)) }")).toEqual([
      0, 0.5, 1, 1.5, 1.75, 2.25, 2.75, 3.25,
    ])
    const named = "steps aa = x-\nsteps bb = 2*aa\nblock cc = { kick: 2*bb }\nplay cc"
    expect(hits(named)).toEqual([0, 0.25, 0.5, 0.75])
    expect(clean("play block { kick: 8*- x }").totalSec).toBe(1.125)
  })

  it("rejects repeated figures only where the drum line itself repeats", () => {
    for (const value of ["x-x-", "2*x-", "2*(x-)"]) {
      expect(errors(`play pattern { kick: ${value} }`)).toMatch(/pattern repeats it/)
      expect(errors(`pattern pp = { kick: ${value} }`)).toMatch(/pattern repeats it/)
      clean(`block bb = { kick: ${value} }\nplay bb`)
      clean(`play block { kick: ${value} }`)
    }
    expect(hits("play block { kick: 8*x- }")).toHaveLength(8)
    expect(errors("play pattern { kick: 8*x- }")).toMatch(/repeats x-/)
  })

  it("bounds repeats and requires integer counts of at least two", () => {
    for (const value of ["0*x-", "1*x-", "-2*x-", "2.5*x-", "3/2*x-"]) {
      expect(errors(`play block { kick: ${value} }`)).toMatch(/integer of at least 2/)
    }
    expect(errors("play block { kick: 100000000000*x- }")).toMatch(/at most 64 bars/)
    expect(errors("play block { kick: 64*(64*(64*x-)) }")).toMatch(/at most 64 bars/)
    expect(errors("play block { kick: 2*() }")).toMatch(/at least one word/)
    expect(errors("play block { kick: 2*(x- }")).toMatch(/missing its/)
    expect(errors("play block { kick: 2*(x-)x- }")).toMatch(/space between/)
  })

  it("fills the containing block with a final step word", () => {
    expect(hits("play block { kick: x ...x-, snare: -------x }")).toEqual([
      0, 0.125, 0.375, 0.625, 0.875,
    ])
    expect(hits("play block { kick: x- ...-, snare: -------x }")).toEqual([0])
    expect(hits("steps aa = x-\nplay block { kick: ...aa } for 1 bars")).toHaveLength(8)
    clean("play block { kick: ...- } for 1 bars")
    expect(errors("play block { kick: ...x- -- }")).toMatch(/nothing goes after/)
    expect(errors("play block { kick: 2*(x- ...-) }")).toMatch(/bounded repeat/)
    expect(errors("steps aa = x- ...-")).toMatch(/length of their own/)
    expect(errors("play block { kick: ...x- }")).toMatch(/nothing says how long/)
  })

  it("keeps Euclidean words and verifies expanded bar markers", () => {
    expect(hits("play block { kick: 3 in 8 }")).toEqual([0, 0.375, 0.75])
    expect(hits("play block { kick: 2*(3 in 8 --) }")).toHaveLength(6)
    clean("play block { kick: 8*x- | x }")
    expect(errors("play block { kick: 4*x- | x }")).toMatch(/isn't at the end of a bar/)
  })

  it("removes beat lists, measured kit parts, rest, and commas", () => {
    for (const value of [
      "2 4",
      "^2 4&",
      "2 beats x-",
      "1 bars rest",
      "x-, --",
      "rest",
      "...rest",
    ]) {
      expect(errors(`play block { kick: ${value} }`), value).not.toBe("")
    }
    clean("play block { piano: notes 8*_ C4--- ..._ } for 1 bars")
    clean("play block { piano: chords C G }")
  })
})

describe("pace and placement", () => {
  it("accepts beats only and rejects an unchanged step length", () => {
    expect(hits("play every 1/2 beats { kick: x- }")).toEqual([0])
    for (const value of ["2 steps", "1 bars", "1/4 beats"]) {
      expect(errors(`play every ${value} { kick: x- }`)).not.toBe("")
    }
    expect(errors("play every 1/2 beats { every 1/2 beats { kick: x- } }")).toMatch(
      /current step length/,
    )
    clean("play every 1/2 beats { every 1/3 beats { kick: x- } }")
    const triplets = clean("play every 1/3 beats { block { hat: 12*x } }")
    expect(triplets.totalSec).toBe(2)
    expect(triplets.drumEvents).toHaveLength(12)
  })

  it("places named and inline blocks identically, without replacing sibling hits", () => {
    const named = "block fill = { crash: x }\nplay pattern { kick: x---, fill on bar 2 } for 2 bars"
    const inline = "play pattern { kick: x---, block { crash: x } on bar 2 } for 2 bars"
    expect(hits(named, "crash")).toEqual([2])
    expect(hits(inline, "crash")).toEqual(hits(named, "crash"))
    expect(hits(inline)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5])
    expect(hits("play block { crash: x } on bar 2 for 2 bars", "crash")).toEqual([2])
    expect(hits("play block { block { kick: x } on bar 2 to 3 } for 3 bars")).toEqual([2])
  })

  it("places patterns over a range and rejects the old prefix syntax", () => {
    expect(hits("play block { pattern { kick: x--- } on bar 2 to 3 } for 3 bars")).toEqual([
      2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5,
    ])
    expect(errors("play block { bar 2 { crash: x } }")).toMatch(/Placement follows its value/)
    expect(errors("play block { block { kick: x } on bar 3 to 2 }")).toMatch(/backwards/)
    expect(errors("play block { block { kick: x } on bar 0 }")).toMatch(/counted from 1/)
    expect(errors("play block { block { kick: x } on bar 2 extra }")).toMatch(/Placement ends/)
    expect(errors("play block { { kick: x } on bar 2 }")).toMatch(/braces need a type/)
  })
})

describe("highlighting the redesigned syntax", () => {
  const painted = (source: string) => {
    const lines = highlightMusic(source)
    expect(lines.map((line) => line.map((p) => p.s).join("")).join("\n")).toBe(source)
    return lines.flat()
  }
  const red = (source: string) =>
    painted(source)
      .filter((p) => p.c === "tk-error")
      .map((p) => p.s)

  it("highlights nested repeats and comma entries across layout newlines", () => {
    for (const source of [
      "play block { kick: 2*(x- 3*(-- ^-)), snare: x }",
      "play block { kick: x-\n 2*(-- ^-),\n snare: x }",
      "play block { kick: {\n x-, // two layers\n --^\n }, snare: x }",
      "play block { kick: x, block { crash: x } on bar 2 } for 2 bars",
      "block fill = { kick: x }\nplay block { fill on bar 2 to 3 }",
      "play block { piano: notes -1 7*- fifth(1, 2) 7*-, with key D, mode minor { bass: notes 1---, }, }",
    ])
      expect(red(source), source).toEqual([])
    expect(
      painted("play block { kick: x, snare: x }")
        .filter((p) => p.c === "tk-inst")
        .map((p) => p.s),
    ).toEqual(["kick", "snare"])
  })

  it("marks removed kit syntax and invalid repeat groups", () => {
    for (const value of ["rest", "2 4", "2 beats x-", "x-, --", "...rest", "1*x-", "(x- --^)"]) {
      expect(red(`play block { kick: ${value} }`), value).not.toEqual([])
    }
    expect(red("play block { bar 2 { kick: x } }")).toContain("bar")
    expect(red("play every 2 steps { kick: x }")).toContain("steps")
  })

  it("retains note repeats, rests, function commas, and relative note chains", () => {
    expect(red("play block { piano: notes 8*_ C4--- ..._, guitar: chords Am F }")).toEqual([])
    expect(red("play piano: notes fifth(C3, 2)---")).toEqual([])
  })
})
