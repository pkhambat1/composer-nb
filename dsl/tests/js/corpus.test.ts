/* The golden corpus: every real cell the project ships, and what it plays. The docs
   examples, the groove library (which is also the playground's starter notebook) and the
   Claude plugin's skill examples are each written out, cell by cell, as their errors, the
   names they define, what they carry into the next cell, their blocks and every event, in
   corpus/*.txt. A change to the engine that changes any of that changes one of those files,
   so the diff is the list of real cells it changes. If the change is meant, update the files
   with `npx vitest run -u` and read the diff. */
import { describe, it, expect } from "vitest"
import { parseCell } from "../../js/language.ts"
import { realCells } from "./real-cells.ts"

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
    ...Object.entries(state.words).map(([n, w]: [string, any]) => `${n} ${w.type} line ${w.line}`),
    ...Object.entries(state.sections).map(([n, s]: [string, any]) => `${n} pattern line ${s.ln}`),
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

// One file per group of cells
const FILES = { docs: "docs.txt", grooves: "grooves.txt", skills: "skills.txt" }

describe("golden corpus", () => {
  for (const [group, name] of Object.entries(FILES)) {
    it(group, async () => {
      const cells = realCells(group).map((c) => cellText(c.title, parseCell(c.source, c.inherited)))
      await expect(file(cells)).toMatchFileSnapshot(`./corpus/${name}`)
    })
  }
})
