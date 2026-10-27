/* The docs site (docs/*.mdx) can't drift from the language or from itself. The examples have
   to parse: a ```composer-nb block must come back with no errors, unless it's titled
   Invalid, in which case it must come back with at least one. Every kit piece and instrument
   the language has must be in its page's table. And the site has to hold together: every page
   in the sidebar, every link landing on a heading that exists. */
import { describe, it, expect } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { initialState, LANES, parseCell, PITCHED } from "../../js/language.js"
import { highlightMusic } from "../../js/highlight.js"
import { DOCS, examples, pages, read, readMagic } from "./docs-examples.js"

describe("docs examples", () => {
  it("finds the pages", () => {
    expect(pages.length).toBeGreaterThan(0)
  })

  for (const page of pages) {
    const blocks = examples(read(page))
    if (!blocks.length) continue
    it(`${page} parses`, () => {
      const cells = {}
      for (const block of blocks) {
        const { body, name, after } = readMagic(block.source)
        if (after)
          expect(cells, `${page}:${block.line} continues from ${after}`).toHaveProperty(after)
        const parsed = parseCell(body, after ? cells[after] : initialState())
        const errors = parsed.errors.map((e) => `line ${e.line}: ${e.msg}`)
        if (block.invalid) expect(errors, `${page}:${block.line}`).not.toEqual([])
        else expect(errors, `${page}:${block.line}`).toEqual([])
        // A cell frames the playground, whose editor colours the source: a line that
        // parses mustn't be painted as a mistake there.
        if (!block.invalid) {
          const painted = highlightMusic(body)
            .map((parts, i) => [i + 1, parts.filter((p) => p.c === "tk-error").map((p) => p.s)])
            .filter(([, marked]) => marked.length)
          expect(painted, `${page}:${block.line} is coloured as a mistake`).toEqual([])
        }
        if (name) cells[name] = parsed.state
      }
    })
  }
})

// A kit piece or instrument that exists in the language and not in its table is one nobody can
// find.
describe("docs names", () => {
  it("drums/kit.mdx has every kit piece", () => {
    const text = read("drums/kit.mdx")
    expect(LANES.filter((name) => !text.includes("| `" + name + "`"))).toEqual([])
  })
  it("pitched/instruments.mdx has every instrument", () => {
    const text = read("pitched/instruments.mdx")
    expect(PITCHED.filter((name) => !text.includes("| `" + name + "`"))).toEqual([])
  })
})

// The anchor Mintlify gives a heading: lowercase, punctuation dropped, spaces to hyphens.
const anchor = (heading) =>
  heading
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .trim()
    .replace(/ +/g, "-")

describe("docs site", () => {
  const site = JSON.parse(read("docs.json"))
  const address = (page) => "/" + page.replace(/\.mdx$/, "")
  const headings = Object.fromEntries(
    pages.map((page) => [
      address(page),
      [...read(page).matchAll(/^#{2,4} (.+)$/gm)].map((m) => anchor(m[1])),
    ]),
  )
  // The index page is served at the root of the site.
  headings["/"] = headings["/index"]

  it("lists every page in the sidebar", () => {
    const listed = site.navigation.groups.flatMap((group) => group.pages)
    expect([...listed].sort()).toEqual(pages.map((page) => address(page).slice(1)))
  })

  it("redirects old addresses to pages that exist", () => {
    for (const { source, destination } of site.redirects) {
      const [path, hash] = destination.split("#")
      expect(headings, source).toHaveProperty([path])
      if (hash) expect(headings[path], source).toContain(hash)
    }
  })

  for (const page of pages) {
    it(`${page} links to pages, headings and images that exist`, () => {
      const text = read(page)
      const broken = []
      for (const [, path, hash] of text.matchAll(/\]\((\/[^)#\s]*)?(?:#([^)\s]+))?\)/g)) {
        if (!path && !hash) continue
        const target = path || address(page)
        if (!(target in headings)) broken.push(target)
        else if (hash && !headings[target].includes(hash)) broken.push(`${target}#${hash}`)
      }
      for (const [, src] of text.matchAll(/src="(\/[^"]+)"/g)) {
        if (!existsSync(join(DOCS, src))) broken.push(src)
      }
      expect(broken).toEqual([])
    })
  }

  // An example a reader can run is shown as a cell they can run (snippets/cell.jsx). The
  // playground takes no %%music line, and an Invalid example is there for its message.
  for (const page of pages) {
    const playable = examples(read(page)).filter(
      (block) => !block.invalid && !block.source.startsWith("%%music"),
    )
    if (!playable.length) continue
    it(`${page} shows its examples as cells`, () => {
      const text = read(page)
      expect(text).toContain('import { Cell } from "/snippets/cell.jsx"')
      const bare = playable.filter((block) => {
        const before = text
          .split("\n")
          .slice(0, block.line - 1)
          .join("\n")
        return !/<Cell>\n\n$/.test(before + "\n")
      })
      expect(bare.map((block) => `line ${block.line}`)).toEqual([])
    })
  }
})
