/// <reference types="vite/client" />
/* An editor marks code as wrong if and only if the engine reports a mistake there, one mark
   per mistake. These cells are broken on purpose, each with its mistakes marked (see
   error-spans/cases.ts): the spans the engine reports must be exactly the marked ones, and
   every reported mistake must have been found where it was reported. Cells that are right
   (the docs, the skills, the grooves) must report nothing. */
import { describe, it, expect, beforeEach } from "vitest"
import { initialState, parseCell } from "../../js/language.ts"
import { overlaps, unlocated } from "../../js/diagnostics.ts"
import { marked, type Case } from "./error-spans/cases.ts"
import { examples, pages, read } from "./docs-examples.ts"

const areas = import.meta.glob<{ CASES: Case[] }>("./error-spans/*.cases.ts", { eager: true })

const spanOf = (e: { line: number; col: number; endLine: number; endCol: number }) => ({
  line: e.line,
  col: e.col,
  endLine: e.endLine,
  endCol: e.endCol,
})

beforeEach(() => {
  unlocated.length = 0
})

for (const [file, { CASES }] of Object.entries(areas)) {
  describe(file.replace(/^.*\/|\.cases\.ts$/g, ""), () => {
    for (const c of CASES) {
      it(c.cell, () => {
        const { src, spans } = marked(c.cell)
        const inherited = c.above ? parseCell(c.above).state : initialState()
        unlocated.length = 0
        const { errors } = parseCell(src, inherited)
        expect(unlocated).toEqual([])
        expect(spans.length).toBeGreaterThan(0)
        expect(errors.map(spanOf), errors.map((e) => e.msg).join("\n")).toEqual(spans)
      })
    }
  })
}

describe("reported mistakes", () => {
  it("each have a span of their own", () => {
    for (const { CASES } of Object.values(areas))
      for (const c of CASES) {
        const { src } = marked(c.cell)
        const inherited = c.above ? parseCell(c.above).state : initialState()
        const { errors } = parseCell(src, inherited)
        for (const [i, a] of errors.entries()) {
          expect(a.endLine > a.line || a.endCol > a.col).toBe(true)
          for (const b of errors.slice(i + 1)) expect(overlaps(a, b)).toBe(false)
        }
      }
  })
})

// The docs' examples titled Invalid are broken on purpose: each mistake in them is found where
// it was reported, so the docs site's playground marks it exactly
describe("the docs' invalid examples", () => {
  for (const page of pages)
    for (const example of examples(read(page)).filter((e) => e.invalid))
      it(`${page}:${example.line}`, () => {
        unlocated.length = 0
        const { errors } = parseCell(example.source)
        expect(errors.length).toBeGreaterThan(0)
        expect(unlocated).toEqual([])
      })
})
