/* Every real cell the project ships, in three groups: the docs examples, the groove library
   (which is also the playground's starter notebook) and the Claude plugin's skill examples.
   Each comes with the state it starts from, as it would in a notebook. Shared by the golden
   corpus and the parser's tests. */
import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { initialState, parseCell } from "../../js/language.ts"
import { GROOVES } from "../../js/grooves.ts"
import { examples, pages, read, readMagic } from "./docs-examples.ts"

const SKILLS = fileURLToPath(new URL("../../../plugin/skills", import.meta.url))

// [{ title, source, inherited }] for one group
export function realCells(group) {
  if (group === "docs") {
    const cells: any[] = []
    for (const page of pages) {
      const named = {}
      for (const block of examples(read(page))) {
        const { body, name, after } = readMagic(block.source)
        const inherited = after ? named[after] : initialState()
        if (name) named[name] = parseCell(body, inherited).state
        cells.push({ title: `${page}:${block.line}`, source: body, inherited })
      }
    }
    return cells
  }
  if (group === "grooves") {
    return GROOVES.map((g) => ({ title: g.title, source: g.source, inherited: initialState() }))
  }
  if (group === "skills") {
    const cells: any[] = []
    for (const skill of readdirSync(SKILLS).sort()) {
      const text = readFileSync(`${SKILLS}/${skill}/SKILL.md`, "utf8")
      const blocks = [...text.matchAll(/^```composer-nb\n([\s\S]*?)\n```/gm)].map((m) => m[1])
      // Each example follows the ones above it in the same skill, as cells in a notebook.
      let inherited = initialState()
      blocks.forEach((source, i) => {
        cells.push({ title: `${skill} example ${i + 1}`, source, inherited })
        inherited = parseCell(source, inherited).state
      })
    }
    return cells
  }
  throw new Error(`No group of cells called ${group}`)
}

export const GROUPS = ["docs", "grooves", "skills"]
