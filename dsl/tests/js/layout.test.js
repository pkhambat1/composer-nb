/* Every cell the project ships is laid out the one way: two spaces a level, nothing after a
   ( that runs over lines, no blocks side by side on a line that goes on, one space after a
   colon, no lined-up columns, no trailing spaces and never two blank lines. */
import { describe, it, expect } from "vitest"
import { realCells } from "./real-cells.js"

function problems(source) {
  const out = []
  source.split("\n").forEach((line, i) => {
    const code = line.replace(/\/\/.*/, "")
    const at = `line ${i + 1}`
    const opens = (code.match(/\(/g) || []).length - (code.match(/\)/g) || []).length
    if (opens > 0 && !/\(\s*$/.test(code)) out.push(`${at}: a ( that runs over lines ends its line`)
    if (/\}\s*\{\s*$/.test(code)) out.push(`${at}: one block a line in a group that runs over lines`)
    if (/\s$/.test(line)) out.push(`${at}: a trailing space`)
    if (/^\s*[a-z][\w.]*:\S/.test(code)) out.push(`${at}: one space after the colon`)
    if (/\S {2,}\S/.test(code)) out.push(`${at}: one space between words, no columns`)
    if (/^ */.exec(line)[0].length % 2) out.push(`${at}: two spaces a level`)
  })
  if (/\n\s*\n\s*\n/.test(source)) out.push("never two blank lines")
  return out
}

describe("every shipped cell is laid out the one way", () => {
  for (const group of ["docs", "grooves", "skills"]) {
    it(group, () => {
      const bad = realCells(group)
        .map((c) => [c.title, problems(c.source)])
        .filter(([, p]) => p.length)
      expect(bad).toEqual([])
    })
  }
})
