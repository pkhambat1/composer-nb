/* mcp/src/reference.ts is written from the docs; it can't fall behind them. */
import { it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { referencePages, referenceSource } from "../scripts/reference.ts"

it("exposes the complete reference with stable legacy topics and dedicated function topics", () => {
  const pages = referencePages()
  const ids = pages.map((page) => page.id)
  expect(ids).toEqual(
    expect.arrayContaining([
      "overview",
      "settings",
      "patterns",
      "play",
      "kit",
      "steps",
      "instruments",
      "key",
      "notes",
      "chords",
      "symbols",
      "values",
      "expressions",
      "intervals",
      "extend",
      "print",
      "chord-symbols",
    ]),
  )
  expect(new Set(ids).size).toBe(ids.length)
  for (const guide of ["index", "for-musicians", "assistants"]) expect(ids).not.toContain(guide)
  for (const page of pages) {
    expect(page.title, page.id).toBeTruthy()
    expect(page.description, page.id).toBeTruthy()
    expect(page.text, page.id).toContain(`# ${page.title}`)
    expect(page.text, page.id).not.toMatch(/\]\(\//)
  }
})

it("reference.ts is what the docs say now (run npm run reference -w mcp)", () => {
  const file = readFileSync(fileURLToPath(new URL("../src/reference.ts", import.meta.url)), "utf8")
  expect(file).toBe(referenceSource())
})
