/* The front end (lexer.ts, parser.ts) has to read every real cell the way parseCell does:
   the same names declared, the same plays, the same brace mistakes. */
import { describe, it, expect } from "vitest"
import { parseCell } from "../../js/language.ts"
import { Lexer } from "../../js/lexer.ts"
import { Parser } from "../../js/parser.ts"
import { GROUPS, realCells } from "./real-cells.js"

// Every statement in a cell, inside blocks too
function* walk(statements) {
  for (const s of statements) {
    yield s
    const values = s.kind === "with" ? [s.settings, s.value] : [s.value]
    for (const v of values)
      for (const p of v.parts) if (p.kind === "block") yield* walk(p.statements)
  }
}

describe("on every real cell", () => {
  for (const group of GROUPS) {
    for (const { title, source, inherited } of realCells(group)) {
      it(`${group}: ${title}`, () => {
        // The tokens are the whole cell, each starting where the one before ends
        const tokens = Lexer.tokens(source)
        expect(tokens.map((t) => t.text).join("")).toBe(source)
        for (let i = 1; i < tokens.length; i++) {
          const [a, b] = [tokens[i - 1].span, tokens[i].span]
          expect([b.line, b.col]).toEqual([a.endLine, a.endCol])
        }

        const old = parseCell(source, inherited)
        const cell = Parser.parse(source)
        const all = [...walk(cell.statements)]
        // The names it declares
        const declared = all.filter((s) => s.kind === "decl").map((s) => s.name)
        const named = [...Object.keys(old.state.words), ...Object.keys(old.state.sections)]
        const isNew = (n) => !(n in inherited.words) && !(n in inherited.sections)
        expect(new Set(declared.filter(isNew))).toEqual(new Set(named.filter(isNew)))
        // What it plays
        expect(all.filter((s) => s.kind === "play").length).toBe(old.outputs.length)
        // Its brace mistakes
        const braces = old.errors.some((e) => /to close it|doesn't close anything/.test(e.msg))
        expect(cell.errors.length > 0).toBe(braces)
      })
    }
  }
})

// Each statement's kind and the text it holds, blocks shown as {...}
const shape = (src) =>
  Parser.parse(src).statements.map((s) => {
    const text = (v) => v.parts.map((p) => (p.kind === "text" ? p.text : "{...}")).join(" ")
    if (s.kind === "with") return `with [${text(s.settings)}] ${text(s.value)}`
    const head =
      s.kind === "decl"
        ? `${s.type} ${s.name} =`
        : s.kind === "track"
          ? `${s.part}:`
          : s.kind === "set"
            ? s.setting
            : ""
    return [s.kind, head, text(s.value)].filter(Boolean).join(" ")
  })

describe("the parser", () => {
  it("knows a statement by how it starts", () => {
    const src = [
      "set tempo 90",
      "steps pair = ^-x-",
      "fig = x-",
      "pattern groove = 4 bars {",
      "  kick: x---",
      "  bar 2 { crash: 1 }",
      "  every 3 steps { hat: x }",
      "}",
      "with key E, mode minor {",
      "  play groove",
      "}",
      "play (groove { snare: --x- })",
    ].join("\n")
    expect(shape(src)).toEqual([
      "set tempo 90",
      "decl steps pair = ^-x-",
      "decl null fig = x-",
      "decl pattern groove = 4 bars {...}",
      "with [key E, mode minor] {...}",
      "play (groove {...} )",
    ])
    const [, , , groove] = Parser.parse(src).statements
    expect(groove.value.parts[1].statements.map((s) => s.kind)).toEqual(["track", "place", "pace"])
  })

  it("reads a line that starts with | as the end of the line above", () => {
    expect(shape("play {\n  hat: x-x- x-x-\n  | xxxx xxxx\n}")).toEqual(["play {...}"])
    const [play] = Parser.parse("play {\n  hat: x-x- x-x-\n  | xxxx xxxx\n}").statements
    const [hat] = play.value.parts[0].statements
    expect(hat.value.parts[0].text).toBe("x-x- x-x-\n  | xxxx xxxx")
  })

  it("reads a group in brackets to its ), whatever lines it takes, and a block's lines in it", () => {
    const src = "play (\n  intro\n  {\n    kick: x---\n    snare: --x-\n  }\n  verse\n)"
    const [play] = Parser.parse(src).statements
    expect(play.kind).toBe("play")
    const block = play.value.parts.find((p) => p.kind === "block")
    expect(block.statements.map((s) => s.kind)).toEqual(["track", "track"])
  })

  it("leaves comments out", () => {
    expect(shape("// a groove\nset tempo 90 // slow\nplay groove")).toEqual([
      "set tempo 90",
      "play groove",
    ])
  })

  it("knows where everything was written", () => {
    const [, steps] = Parser.parse("set tempo 90\n  steps pair = ^-x-").statements
    expect(steps.span).toEqual({ line: 2, col: 2, endLine: 2, endCol: 19 })
    expect(steps.value.span).toEqual({ line: 2, col: 15, endLine: 2, endCol: 19 })
  })

  it("says where a brace isn't closed, and where one closes nothing", () => {
    expect(Parser.parse("play {\n  kick: x---").errors).toEqual([
      { code: "brace.unclosed", span: { line: 1, col: 5, endLine: 1, endCol: 6 } },
    ])
    expect(Parser.parse("play groove\n}").errors).toEqual([
      { code: "brace.stray", span: { line: 2, col: 0, endLine: 2, endCol: 1 } },
    ])
  })
})
