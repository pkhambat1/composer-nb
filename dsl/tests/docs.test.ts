/* The docs site (docs/*.mdx) can't drift from the language or from itself. The examples have
   to parse: a ```composer-nb block must come back with no errors, unless it's titled
   Invalid, in which case it must come back with at least one. Every kit piece and instrument
   the language has must be in its page's table. And the site has to hold together: every page
   in the sidebar, every link landing on a heading that exists. */
import site from "../../docs/docs.json" with { type: "json" }
import { describe, it, expect } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { ChordType } from "tonal"
import {
  initialState,
  INTERVALS,
  KEYWORDS,
  KITS,
  LANES,
  MODES,
  parseCell,
  printLayout,
  printRowText,
  PITCHED,
  SETTINGS,
  SOUNDS,
  TYPES,
} from "../src/language.ts"
import { buildChord } from "../src/chords.ts"
import { DOCS, documentedResults, examples, pages, read } from "./docs-examples.ts"

describe("docs examples", () => {
  it("finds the pages", () => {
    expect(pages.length).toBeGreaterThan(0)
  })

  for (const page of pages) {
    for (const block of examples(read(page))) {
      it(`${page}:${block.line} ${block.invalid ? "rejects invalid syntax" : "parses"}`, () => {
        const { errors } = parseCell(block.source, initialState())
        if (block.invalid) expect(errors.length).toBeGreaterThan(0)
        else expect(errors).toEqual([])
      })
    }
  }
})

// A kit piece or instrument that exists in the language and not in its table is one nobody can
// find.
describe("docs names", () => {
  const inlineNames = (page: string) =>
    new Set([...read(page).matchAll(/`([^`\n]+)`/g)].map((m) => m[1]))

  it("drums/kit.mdx has every kit piece", () => {
    const text = read("drums/kit.mdx")
    expect(LANES.filter((name) => !text.includes("| `" + name + "`"))).toEqual([])
  })
  it("pitched/instruments.mdx has every instrument", () => {
    const text = read("pitched/instruments.mdx")
    expect(PITCHED.filter((name) => !text.includes("| `" + name + "`"))).toEqual([])
  })

  it("indexes every public keyword, type, setting, function and instrument", () => {
    const text = read("reference/symbols.mdx")
    const names = [
      ...KEYWORDS,
      ...TYPES,
      ...SETTINGS,
      ...Object.keys(SOUNDS),
      ...Object.keys(INTERVALS),
      ...LANES,
      ...PITCHED,
    ]
    // An entry is the name in code, or a link whose label contains the name (`on bar`).
    expect(
      names.filter(
        (name) =>
          !text.includes("`" + name + "`") &&
          !new RegExp("\\[[^\\]]*\\b" + name + "\\b[^\\]]*\\]").test(text),
      ),
    ).toEqual([])
  })

  it("documents all value types and accepted setting values", () => {
    expect(TYPES.filter((name) => !inlineNames("language/values.mdx").has(name))).toEqual([])
    expect(MODES.filter((name) => !inlineNames("pitched/key.mdx").has(name))).toEqual([])
    expect(KITS.filter((name) => !inlineNames("drums/kit.mdx").has(name))).toEqual([])
    const sounds = Object.values(SOUNDS).flat()
    expect(sounds.filter((name) => !inlineNames("pitched/instruments.mdx").has(name))).toEqual([])
  })

  it("gives every setting and interval function a searchable heading", () => {
    const namedHeadings = (page: string) =>
      new Set([...read(page).matchAll(/^#{2,4} `?([A-Za-z.]+)`?\s*$/gm)].map((m) => m[1]))
    const settings = namedHeadings("language/settings.mdx")
    // The function index table lists each function in code in its first column.
    const functions = new Set(
      [...read("functions/intervals.mdx").matchAll(/^\| `([a-z]+)` \|/gm)].map((m) => m[1]),
    )
    expect([...SETTINGS, ...Object.keys(SOUNDS)].filter((name) => !settings.has(name))).toEqual([])
    expect(Object.keys(INTERVALS).filter((name) => !functions.has(name))).toEqual([])
  })

  it("lists every accepted dictionary chord suffix, including minor 6/9", () => {
    const documented = inlineNames("pitched/chord-symbols.mdx")
    const aliases = new Set(ChordType.all().flatMap((chord) => chord.aliases))
    const accepted = [...aliases].filter(
      (suffix) =>
        suffix &&
        buildChord("C" + suffix) &&
        parseCell(`chords value = C${suffix}`, initialState()).errors.length === 0,
    )
    expect([...accepted, "m6/9"].filter((suffix) => !documented.has(suffix))).toEqual([])
  })

  it("the documented fourth-degree and lower-octave operation produces the promised chord", () => {
    const example = examples(read("functions/intervals.mdx")).find(
      (block) => !block.invalid && block.source.includes("octave(fourth("),
    )
    expect(example, "The transformation needs one runnable, minimal example").toBeDefined()
    const parsed = parseCell(example!.source, initialState())
    expect(parsed.errors).toEqual([])
    const items = parsed.prints.flatMap((print) => print.values.flatMap((value) => value.items))
    expect(items).toContainEqual(
      expect.objectContaining({
        chord: "F",
        tones: ["F2", "A2", "C3"],
      }),
    )
  })
})

// The anchor Mintlify gives a heading: lowercase, punctuation dropped, spaces to hyphens.
const anchor = (heading: string) =>
  heading
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .trim()
    .replace(/ +/g, "-")

describe("docs site", () => {
  const address = (page: string) => "/" + page.replace(/\.mdx$/, "")
  const headings = Object.fromEntries(
    pages.map((page: string) => [
      address(page),
      [...read(page).matchAll(/^#{2,4} (.+)$/gm)].map((m) => anchor(m[1])),
    ]),
  )
  // The index page is served at the root of the site.
  headings["/"] = headings["/index"]

  it("lists every page in the sidebar", () => {
    const listed = site.navigation.groups.flatMap((group: { pages: string[] }) => group.pages)
    expect([...listed].sort()).toEqual(pages.map((page: string) => address(page).slice(1)))
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
      const broken: string[] = []
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
})

describe("documented results", () => {
  for (const page of pages)
    for (const result of documentedResults(read(page)))
      it(`${page}:${result.line} matches its ${result.kind}`, () => {
        const parsed = parseCell(result.source)
        const actual =
          result.kind === "text Output"
            ? printLayout(parsed.prints).map(printRowText).join("\n")
            : parsed.errors.map((e) => e.msg).join("\n")
        expect(actual).toBe(result.expected)
      })

  it("keeps the README's musical examples runnable", () => {
    const text = readFileSync(join(DOCS, "../README.md"), "utf8")
    const blocks = examples(text)
    expect(blocks.length).toBeGreaterThan(0)
    for (const block of blocks) expect(parseCell(block.source).errors, block.source).toEqual([])
  })
})
