/* The examples in the docs site (docs/*.mdx) have to parse, so the pages can't drift from
   the language. A ```composer-nb block must come back with no errors, unless it's titled
   Invalid, in which case it must come back with at least one. */
import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { initialState, parseCell } from "../../js/language.js"

const DOCS = fileURLToPath(new URL("../../../docs", import.meta.url))
const pages = readdirSync(DOCS, { recursive: true })
  .filter((f) => f.endsWith(".mdx"))
  .sort()

// The composer-nb blocks on a page: each one's source, the line it starts on, and whether
// it's titled Invalid. A block inside a list is indented, and so is its closing fence.
function examples(text) {
  const found = []
  const fence = /^([ \t]*)```composer-nb([^\n]*)\n([\s\S]*?)\n\1```/gm
  for (const m of text.matchAll(fence)) {
    found.push({
      line: text.slice(0, m.index).split("\n").length,
      invalid: /\bInvalid\b/.test(m[2]),
      source: m[3]
        .split("\n")
        .map((l) => l.slice(m[1].length))
        .join("\n"),
    })
  }
  return found
}

// %%music verse after intro: a Jupyter cell's name and the cell it continues from. Named
// cells hand their state to later blocks on the same page.
function readMagic(source) {
  const m = /^%%music[ \t]*(.*)\n?/.exec(source)
  if (!m) return { body: source }
  const words = m[1].split(/\s+/).filter(Boolean)
  const at = words.indexOf("after")
  return {
    body: source.slice(m[0].length),
    name: at === 0 ? undefined : words[0],
    after: at < 0 ? undefined : words[at + 1],
  }
}

describe("docs examples", () => {
  it("finds the pages", () => {
    expect(pages.length).toBeGreaterThan(0)
  })

  for (const page of pages) {
    const blocks = examples(readFileSync(join(DOCS, page), "utf8"))
    if (!blocks.length) continue
    it(`${page} parses`, () => {
      const cells = {}
      for (const block of blocks) {
        const { body, name, after } = readMagic(block.source)
        if (after) expect(cells, `${page}:${block.line} continues from ${after}`).toHaveProperty(after)
        const parsed = parseCell(body, after ? cells[after] : initialState())
        const errors = parsed.errors.map((e) => `line ${e.line}: ${e.msg}`)
        if (block.invalid) expect(errors, `${page}:${block.line}`).not.toEqual([])
        else expect(errors, `${page}:${block.line}`).toEqual([])
        if (name) cells[name] = parsed.state
      }
    })
  }
})
