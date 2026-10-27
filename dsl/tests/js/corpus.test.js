/* The golden corpus: every real cell the project ships, and what it plays. The docs
   examples, the groove library (which is also the playground's starter notebook) and the
   Claude plugin's skill examples are each written out, cell by cell, as their errors, the
   names they define, what they carry into the next cell, their blocks and every event, in
   corpus/*.txt. A change to the engine that changes any of that changes one of those files,
   so the diff is the list of real cells it changes. If the change is meant, update the files
   with `npx vitest run -u` and read the diff. */
import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { initialState, parseCell } from "../../js/language.js"
import { GROOVES } from "../../js/grooves.js"
import { examples, pages, read, readMagic } from "./docs-examples.js"

const SKILLS = fileURLToPath(new URL("../../../plugin/skills", import.meta.url))

// Times to four places, so float noise doesn't count as a change.
const num = (n) => String(+n.toFixed(4))
const value = (v) =>
  typeof v === "number" ? num(v) : typeof v === "object" ? JSON.stringify(v) : String(v)

// One event on one line: its start in seconds, then its fields in the order the engine
// gives them. A field that's false or missing is left out, so a new field shows as an
// addition and not as a change to every line.
function event(e) {
  const fields = Object.entries(e)
    .filter(([k, v]) => k !== "secStart" && v !== false && v != null)
    .map(([k, v]) => `${k}=${value(v)}`)
  return `  ${num(e.secStart)} ${fields.join(" ")}`
}

// Events in time order, and in a fixed order within a moment, so a refactor that only
// changes the order the engine pushes them in changes nothing here.
const sorted = (events) =>
  events.map((e) => [e.secStart, event(e)]).sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1))

const BLOCK = ["startSec", "durSec", "bars", "time", "tempo", "key", "unit", "barTicks", "res"]

function cellText(title, parsed) {
  const { state } = parsed
  const names = [
    ...Object.entries(state.words).map(([n, w]) => `${n} ${w.type} line ${w.line}`),
    ...Object.entries(state.sections).map(([n, s]) => `${n} pattern line ${s.ln}`),
  ]
  const out = [`## ${title}`]
  out.push(`errors: ${parsed.errors.length ? "" : "none"}`)
  for (const e of parsed.errors) out.push(`  line ${e.line}: ${e.msg}`)
  out.push(`names: ${names.join(", ") || "none"}`)
  out.push(`from above: ${parsed.fromAbove.join(", ") || "none"}`)
  out.push(`length: ${num(parsed.totalSec)} s`)
  for (const b of parsed.blocks) {
    const fields = BLOCK.filter((k) => b[k] != null).map((k) => `${k}=${value(b[k])}`)
    out.push(`block ${fields.join(" ")}`)
  }
  for (const [label, events] of [
    ["drums", parsed.drumEvents],
    ["notes", parsed.notes],
    ["chords", parsed.chords],
  ]) {
    if (!events.length) continue
    out.push(`${label}:`)
    out.push(...sorted(events).map(([, line]) => line))
  }
  return out.join("\n")
}

const file = (cells) => cells.join("\n\n") + "\n"

describe("golden corpus", () => {
  it("docs examples", async () => {
    const cells = []
    for (const page of pages) {
      const named = {}
      for (const block of examples(read(page))) {
        const { body, name, after } = readMagic(block.source)
        const parsed = parseCell(body, after ? named[after] : initialState())
        if (name) named[name] = parsed.state
        cells.push(cellText(`${page}:${block.line}`, parsed))
      }
    }
    await expect(file(cells)).toMatchFileSnapshot("./corpus/docs.txt")
  })

  it("grooves and starter cells", async () => {
    const cells = GROOVES.map((g) => cellText(g.title, parseCell(g.source)))
    await expect(file(cells)).toMatchFileSnapshot("./corpus/grooves.txt")
  })

  it("plugin skill examples", async () => {
    const cells = []
    for (const skill of readdirSync(SKILLS).sort()) {
      const text = readFileSync(`${SKILLS}/${skill}/SKILL.md`, "utf8")
      const blocks = [...text.matchAll(/^```composer-nb\n([\s\S]*?)\n```/gm)].map((m) => m[1])
      // Each example follows the ones above it in the same skill, as cells in a notebook.
      let state = initialState()
      blocks.forEach((source, i) => {
        const parsed = parseCell(source, state)
        state = parsed.state
        cells.push(cellText(`${skill} example ${i + 1}`, parsed))
      })
    }
    await expect(file(cells)).toMatchFileSnapshot("./corpus/skills.txt")
  })
})
