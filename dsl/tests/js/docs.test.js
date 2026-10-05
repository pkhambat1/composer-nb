/* The docs site (docs/*.mdx) can't drift from the language or from itself. The examples have
   to parse: a ```composer-nb block must come back with no errors, unless it's titled
   Invalid, in which case it must come back with at least one. Every drum the language has
   must be on the pages that say what it is. And the site has to hold together: every page
   in the sidebar, every link landing on a heading that exists. */
import { describe, it, expect } from "vitest"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { initialState, LANES, parseCell } from "../../js/language.js"

const DOCS = fileURLToPath(new URL("../../../docs", import.meta.url))
// Design notes sit beside the pages but aren't published (see docs/.mintignore).
const pages = readdirSync(DOCS, { recursive: true })
  .filter((f) => f.endsWith(".mdx") && !f.startsWith("superpowers"))
  .sort()
const read = (file) => readFileSync(join(DOCS, file), "utf8")

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
        if (name) cells[name] = parsed.state
      }
    })
  }
})

// A drum that exists in the language and not in these places is a drum nobody can find:
// the table of drum names, the table from staff position to name, and the staff figure.
describe("docs drums", () => {
  const places = {
    "drums/lines.mdx": (name) => "| `" + name + "`",
    "drums/notation.mdx": (name) => "| `" + name + "`",
    "images/drum-key.svg": (name) => ">" + name + "<",
  }
  for (const [file, mention] of Object.entries(places)) {
    it(`${file} has every drum`, () => {
      const text = read(file)
      expect(LANES.filter((name) => !text.includes(mention(name)))).toEqual([])
    })
  }
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
