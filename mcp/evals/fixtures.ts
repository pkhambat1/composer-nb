/* Runs the graders are checked against: what a perfect assistant would leave for each case
   (the oracle), and a few ways to get it wrong. A run is built by applying writes to a copy
   of the case's starting account, with the tool calls a host would record. */
import { describe as report, parse } from "../src/cell.ts"
import type { NotebookDocument } from "../src/notebook-document.ts"
import { STATES } from "./states.ts"
import type { Call, Run, StateName } from "./types.ts"

export const NEW_NOTEBOOK = "eval-notebook-1"

export function start(state: StateName): Run {
  const notebooks = STATES[state].notebooks
  return {
    before: structuredClone(notebooks),
    after: structuredClone(notebooks),
    calls: [],
    reply: "",
  }
}

export function call(
  run: Run,
  name: string,
  input: Record<string, unknown> = {},
  result = "",
  isError = false,
) {
  const c: Call = { name, input, result, isError }
  run.calls.push(c)
  return run
}

function openOf(run: Run): { notebook: NotebookDocument; cellId: string } {
  // The starting accounts' notebook IDs are distinct, so the notebooks say which one this is
  const open = Object.values(STATES).find(
    (s) => s.open && run.before.some((n) => n.id === s.open!.notebookId),
  )?.open
  if (!open) throw new Error("this account has no open notebook")
  return { notebook: run.after.find((n) => n.id === open.notebookId)!, cellId: open.cellId }
}

const saved = (source: string, after?: string) => {
  const { parsed, earlier } = parse(source, after)
  return report(parsed, earlier, source)
}

/** A refused write: the server's report of the source's errors */
export function refuse(run: Run, name: string, source: string) {
  const { parsed } = parse(source)
  if (!parsed.errors.length) throw new Error(`refuse: the source has no errors: ${source}`)
  return call(run, name, { source }, `Not saved. ${report(parsed, null, source)}`, true)
}

export function create(run: Run, source: string, title = "Music") {
  run.after.push({
    id: NEW_NOTEBOOK,
    title,
    revision: 1,
    cells: [{ id: "eval-cell-1", type: "music", source }],
  })
  return call(run, "create_notebook", { title, source }, `Created ${title}. ${saved(source)}`)
}

const above = (notebook: NotebookDocument, upto = notebook.cells.length) =>
  notebook.cells
    .slice(0, upto)
    .filter((c) => c.type === "music")
    .map((c) => c.source)
    .join("\n\n")

export function add(run: Run, source = "") {
  const { notebook } = openOf(run)
  const after = above(notebook)
  notebook.cells.push({ id: `eval-cell-${notebook.cells.length + 1}`, type: "music", source })
  notebook.revision++
  return call(
    run,
    "add_music_cell",
    { notebookId: notebook.id, source },
    `Added a cell. ${saved(source, after)}`,
  )
}

export function update(run: Run, source: string) {
  const { notebook, cellId } = openOf(run)
  const index = notebook.cells.findIndex((c) => c.id === cellId)
  const input = { notebookId: notebook.id, cellId, source, expectedRevision: notebook.revision }
  notebook.cells[index] = { ...notebook.cells[index], source }
  notebook.revision++
  return call(
    run,
    "update_music_cell",
    input,
    `Changed cell ${index + 1}. ${saved(source, above(notebook, index))}`,
  )
}

export function read(run: Run) {
  const { notebook } = openOf(run)
  return call(run, "get_notebook", { notebookId: notebook.id }, JSON.stringify({ notebook }))
}

export function parseCall(run: Run, source: string, after?: string) {
  const { parsed, earlier } = parse(source, after)
  return call(
    run,
    "parse",
    { source, ...(after ? { after } : {}) },
    report(parsed, earlier, source),
    parsed.errors.length > 0,
  )
}

// --- What a perfect assistant writes, case by case ---

export const ORACLE_CELLS: Record<string, string> = {
  h01: `set tempo 64
set key F#
set mode minor

chords pair = 1m7 fourth(1m7)
chords fall = pair|second(pair, -1)|second(pair, -2)|5dom7 -

play pattern {
  piano: chords fall,
} for 8 bars`,

  h02: `set tempo 132
set key Bb

chords turn = 3m7 6m7
chords tune = turn|second(turn, -1)|third(turn, -1)|1maj9 -

play piano: chords tune`,

  h05: `set key D
set mode minor

chords seed = 1 4|6 5

play piano: chords seed|third(seed)|seed`,

  h10: `set key G
set mode minor

chords one = 1
chords call = one fourth(one)|sixth(one) fifth(one)

play piano: chords call
play organ: chords fifth(call)`,

  h13: `set tempo 120
set key A

chords one = 1dom7
chords four = fourth(one)
chords five = 5dom7

play piano: chords one|one|one|one|four|four|one|one|five|four|one|five`,

  h15: `chords iiVI = 2m7 5dom7|1maj7 -

play (
  with key C { pattern { piano: chords iiVI, } }
  with key F { pattern { piano: chords iiVI, } }
  with key Bb { pattern { piano: chords iiVI, } }
)`,

  l01: `play piano: chords Am|F|C|G`,

  w02: `play organ: chords fourth(cycle)`,

  w06: `play piano: chords Am F`,
}

/** The oracle's run of a case: the calls a perfect assistant makes, and what they leave */
export function oracle(id: string): Run {
  const cell = ORACLE_CELLS[id]
  switch (id) {
    case "w06":
      return update(read(start("broken")), cell)
    case "w02":
      return add(read(start("cycle")), cell)
    default:
      return create(start("empty"), cell)
  }
}

/** The skill's own example: about three typed pitches for every seven that sound */
export const SKILL_EXAMPLE = `set tempo 84
set key A
set mode minor

chords pair = 1m7 fourth(1m7)
chords cycle = pair|second(pair, -1)|second(pair, -2)|5dom7 -
notes roots = 1-------4-------
notes line = roots|second(roots, -1)|second(roots, -2)|-4 15*-

play block {
  with octave 4 { piano: chords cycle, },
  with octave 2 { bass: notes line, },
}`
