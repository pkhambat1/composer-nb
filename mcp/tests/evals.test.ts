// The eval's graders on runs whose scores are known, without a model: a perfect run of
// every case passes, doing nothing fails, and each way of going wrong costs its metric.
import { readFileSync } from "node:fs"
import { parseCell } from "composer-nb/language"
import { describe, expect, it } from "vitest"
import { CASES } from "../evals/cases.ts"
import {
  add,
  call,
  create,
  oracle,
  ORACLE_CELLS,
  parseCall,
  read,
  refuse,
  SKILL_EXAMPLE,
  start,
  update,
} from "../evals/fixtures.ts"
import { grade, readCells, typedRatio, type Case } from "../evals/grade.ts"
import type { Run } from "../evals/types.ts"

const byId = (id: string): Case => CASES.find((c) => c.id === id)!
const scored = (id: string, run: Run) => grade(byId(id), run)
const musicWriting = (c: Case) => ["new", "append", "edit"].includes(c.writes)

describe("the cases", () => {
  const doc = readFileSync(new URL("../evals/CASES.md", import.meta.url), "utf8")

  it("are CASES.md's, in its order, with its prompts", () => {
    const table = [...doc.matchAll(/^\| ([hlw]\d\d)\s+\| (\w+)\s+\| (\w+)\s+\| (\w+|—)\s+\|/gm)]
    expect(CASES.map((c) => [c.id, c.group, c.state, c.harmony ?? "—"])).toEqual(
      table.map((m) => [m[1], m[2], m[3], m[4]]),
    )
    const prompts = Object.fromEntries(
      [...doc.matchAll(/^### (\w\d\d).*\n\n?```\n(.*)\n```/gm)].map((m) => [m[1], m[2]]),
    )
    for (const c of CASES) expect(c.prompt).toBe(prompts[c.id])
  })

  it("have oracle cells that parse clean", () => {
    for (const [id, source] of Object.entries(ORACLE_CELLS)) {
      if (id === "w02") continue // it builds on the names of the cell above, checked by saved
      expect(parseCell(source).errors, id).toEqual([])
    }
  })
})

describe("an oracle run", () => {
  for (const c of CASES)
    it(`passes ${c.id}`, () => {
      const g = grade(c, oracle(c.id))
      expect(g.explanation).toEqual({})
      for (const [id, score] of Object.entries(g.scores))
        if (id !== "typed_ratio") expect(score, id).toBe(1)
      expect("harmony" in g.scores).toBe(c.harmony !== null)
      expect(g.perf).toMatchObject({ failed_writes: 0, redundant_calls: 0, tool_errors: 0 })
    })
})

describe("a null run", () => {
  it("fails every case, since every case should change the account", () => {
    for (const c of CASES) expect(grade(c, start(c.state)).scores.pass, c.id).toBe(0)
  })

  it("isn't saved when the cell it writes is empty", () => {
    for (const c of CASES.filter(musicWriting)) {
      const run = start(c.state)
      if (c.writes === "new") create(run, "")
      else if (c.writes === "append") add(run, "")
      else update(run, "")
      const g = grade(c, run)
      expect(g.scores.saved, c.id).toBe(0)
      expect(g.scores.fits, c.id).toBe(0)
    }
  })
})

describe("harmony", () => {
  const harmonyOf = (id: string, source: string) => {
    const g = scored(id, create(start("empty"), `set tempo 64\n${source}`))
    expect(g.scores.saved).toBe(1)
    expect(g.scores.harmony).toBe(0)
    return g
  }

  it("fails letter-named chords", () => {
    const source =
      "set key F#\nset mode minor\n\nplay pattern {\n  piano: chords F#m|D|A|E,\n} for 8 bars"
    const g = harmonyOf("h01", source)
    expect(g.scores.fits).toBe(1)
    expect(g.explanation.harmony).toMatch(/^letters/)
  })

  it("fails a chart typed degree by degree", () => {
    const source =
      "set key F#\nset mode minor\n\nplay piano: chords 1m7|4m7|7|3maj7|6maj7|2m7b5|5dom7|1m7"
    const g = harmonyOf("h01", source)
    expect(g.scores.fits).toBe(1)
    expect(g.explanation.harmony).toMatch(/functions:/)
    expect(g.explanation.harmony).toMatch(/seed:/)
  })

  it("fails a typed chart with a token wrapped in unison", () => {
    const source =
      "set key F#\nset mode minor\n\nplay piano: chords unison(1m7)|4m7|7|3maj7|6maj7|2m7b5|5dom7|1m7"
    const g = harmonyOf("h01", source)
    expect(g.explanation.harmony).toMatch(/^seed:/)
  })

  it("fails a named chart merely played twice in one key", () => {
    const source = `set key F#
set mode minor

chords prog = 1m7 4m7|7 3maj7|6maj7 2m7b5|5dom7 -

play piano: chords prog
play piano: chords prog`
    const g = harmonyOf("h01", source)
    expect(g.scores.fits).toBe(1)
    expect(g.explanation.harmony).toMatch(/^functions:/)
  })

  it("fails notes stacked to stand in for chords", () => {
    const source = `set key F#
set mode minor

notes root = 1-------4-------
notes line = root|second(root, -1)|root|second(root)

play piano: {
  notes line,
  notes third(line),
  notes fifth(line),
}`
    const g = harmonyOf("h01", source)
    expect(g.explanation.harmony).toMatch(/stacked notes/)
  })

  it("fails 1 5 6 4 however it's built", () => {
    const source = `set key Bb

chords one = 1
chords loop = one|fifth(one)|sixth(one)|fourth(one)

play piano: chords loop`
    const g = harmonyOf("h02", source)
    expect(g.scores.fits).toBe(1)
    expect(g.explanation.harmony).toMatch(/^not a stock loop/)
  })

  it("fails music that doesn't move with the key", () => {
    const source = ORACLE_CELLS.h13.replace("1dom7", "A7")
    const g = harmonyOf("h13", source)
    expect(g.explanation.harmony).toMatch(/transposes/)
  })

  it("fails an append that replays the original cycle without moving it", () => {
    const g = scored("w02", add(read(start("cycle")), "play organ: chords cycle"))
    expect(g.scores.saved).toBe(1)
    expect(g.scores.fits).toBe(0)
    expect(g.scores.pass).toBe(0)
  })

  it("doesn't credit an unused function declaration", () => {
    const g = harmonyOf(
      "h01",
      `set key F#
set mode minor
chords seed = 1m7
chords unused = fifth(1)
play pattern { piano: chords seed, } for 8 bars`,
    )
    expect(g.scores.fits).toBe(1)
    expect(g.explanation.harmony).toMatch(/^functions:/)
  })

  it("moves the implicit key as well as explicit scopes, including a named pattern", () => {
    const source = `chords iiVI = 2m7 5dom7|1maj7 -
pattern cadence = { piano: chords iiVI, }
play cadence
play with key F { cadence }
play with key Bb { cadence }`
    expect(scored("h15", create(start("empty"), source)).explanation).toEqual({})
  })

  it("counts repeated chord attacks and each instrument in the seed ratio", () => {
    const source = ORACLE_CELLS.h10.replace(
      "chords one = 1\nchords call = one fourth(one)|sixth(one) fifth(one)",
      "chords call = 1 4|6 5",
    )
    expect(scored("h10", create(start("empty"), source)).explanation).toEqual({})
  })

  it("counts typed pitches against those that sound", () => {
    const skill = typedRatio(readCells([{ source: SKILL_EXAMPLE, written: true }]))!
    expect(skill).toBeGreaterThan(0.3)
    expect(skill).toBeLessThan(0.5)
    expect(scored("l01", oracle("l01")).scores.typed_ratio).toBe(1)
  })
})

describe("fits", () => {
  const rejects = (id: string, source: string, why: RegExp) => {
    const g = scored(id, create(start("empty"), source))
    expect(g.scores.saved).toBe(1)
    expect(g.scores.fits).toBe(0)
    expect(g.scores.pass).toBe(0)
    expect(g.explanation.fits).toMatch(why)
  }

  it("rejects a fast answer to the slow request", () => {
    rejects("h01", ORACLE_CELLS.h01.replace("tempo 64", "tempo 240"), /90 BPM/)
  })

  it("rejects a melody in place of requested chords", () => {
    rejects(
      "h01",
      `set tempo 64
set key F#
set mode minor
notes riff = 1-------third(1)-------
play pattern { piano: notes riff, } for 8 bars`,
      /no piano chords/,
    )
  })

  it("rejects ii V I on repeat when the prompt rules it out", () => {
    rejects(
      "h02",
      "set key Bb\nchords turn = 2m7 5dom7|1maj7 -\nplay pattern { piano: chords turn, } for 4 bars",
      /only repeats ii V I/,
    )
  })

  it("checks chord tones when returning to the original phrase", () => {
    rejects(
      "h05",
      ORACLE_CELLS.h05.replace("third(seed)|seed", "third(seed)|1M 4M|6m 5M"),
      /bars 5-6/,
    )
  })

  it("requires two bars from each keyboard", () => {
    rejects(
      "h10",
      ORACLE_CELLS.h10.replace("one fourth(one)|sixth(one) fifth(one)", "one fourth(one)"),
      /bars/,
    )
  })

  it("checks the answer's rhythm as well as its roots", () => {
    rejects(
      "h10",
      ORACLE_CELLS.h10.replace(
        "chords fifth(call)",
        "chords fifth(one) -|fifth(fourth(one)) fifth(sixth(one)) fifth(fifth(one)) -",
      ),
      /chords and rhythm/,
    )
  })

  it("requires each literal chord to last its requested bar", () => {
    rejects("l01", "play piano: chords Am _|F _|C _|G _", /whole bar/)
  })

  it("fails the right cell in the wrong key", () => {
    const g = scored(
      "h01",
      create(start("empty"), ORACLE_CELLS.h01.replace("set key F#", "set key G")),
    )
    expect(g.scores.saved).toBe(1)
    expect(g.scores.fits).toBe(0)
    expect(g.explanation.fits).toMatch(/key G/)
  })
})

describe("writes", () => {
  const broken = "set key F#\nset mode minor\n\nplay piano: F#m D"
  const errorsIn = (source: string) => parseCell(source).errors.length

  it("fails two refused writes, and counts their errors", () => {
    const run = start("empty")
    refuse(run, "create_notebook", broken)
    refuse(run, "create_notebook", broken)
    create(run, ORACLE_CELLS.h01)
    const g = scored("h01", run)
    expect(g.scores).toMatchObject({ saved: 1, fits: 1, first_try: 0, pass: 0 })
    expect(g.perf).toMatchObject({
      failed_writes: 2,
      tool_errors: 2,
      dsl_errors: 2 * errorsIn(broken),
    })
    expect(g.explanation.pass).toMatch(/2 refused writes/)
  })

  it("forgives one refused write, but not on the first try", () => {
    const run = start("empty")
    refuse(run, "create_notebook", broken)
    create(run, ORACLE_CELLS.h01)
    const g = scored("h01", run)
    expect(g.scores).toMatchObject({ pass: 1, first_try: 0 })
    expect(g.perf.failed_writes).toBe(1)
  })

  it("counts a parse before the save as redundant", () => {
    const run = start("empty")
    parseCall(run, ORACLE_CELLS.h01)
    create(run, ORACLE_CELLS.h01)
    const g = scored("h01", run)
    expect(g.perf.redundant_calls).toBe(1)
    expect(g.scores.pass).toBe(0)
  })

  it("counts open_notebook after the save as redundant", () => {
    const run = create(start("empty"), ORACLE_CELLS.h01)
    call(run, "open_notebook", { notebookId: "eval-notebook-1" })
    const g = scored("h01", run)
    expect(g.perf.redundant_calls).toBe(1)
    expect(g.scores.pass).toBe(0)
  })

  it("counts list_notebooks first in an empty account as redundant", () => {
    const run = call(start("empty"), "list_notebooks", {}, '{"notebooks":[]}')
    create(run, ORACLE_CELLS.h01)
    expect(scored("h01", run).perf.redundant_calls).toBe(1)
  })

  it("doesn't save an edit made as a new cell", () => {
    const g = scored("w06", add(start("broken"), ORACLE_CELLS.w06))
    expect(g.scores.saved).toBe(0)
    expect(g.explanation.saved).toMatch(/cell/)
  })

  it("doesn't count an append that changes the cell above", () => {
    const run = start("cycle")
    update(run, ORACLE_CELLS.w06)
    add(run, ORACLE_CELLS.w02.replace("chords cycle", "chords 1m"))
    expect(scored("w02", run).scores.saved).toBe(0)
  })

  it("rejects an extra cell when the request was to add one", () => {
    const run = add(add(start("cycle"), ORACLE_CELLS.w02), "")
    expect(scored("w02", run).explanation.saved).toMatch(/2 cells added/)
  })
})
