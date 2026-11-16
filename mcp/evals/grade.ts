/* Scores one run of a case from the notebooks before and after and the tool calls, as
   CASES.md defines the metrics. The music is read back through the engine, so a check asks
   what sounds, not what was typed. No model judges anything. */
import { isDeepStrictEqual } from "node:util"
import { initialState, parseCell, type Output } from "composer-nb/language"
import { highlightMusic } from "composer-nb/highlight"
import type { DocumentCell, NotebookDocument } from "../src/notebook-document.ts"
import { STATES } from "./states.ts"
import { MAX_FAILED_WRITES, type CaseBase, type Grade, type Run } from "./types.ts"

export const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** A note name's pitch class: "F#" 6, "Bb" 10, "C#4" 1 */
export function pcOf(name: string): number {
  const m = /^([A-G])([#b]*)/.exec(name)
  if (!m) return NaN
  let pc = LETTER_PC[m[1]]
  for (const a of m[2]) pc += a === "#" ? 1 : -1
  return (pc + 12) % 12
}

const mod12 = (n: number) => ((n % 12) + 12) % 12

type Where = {
  /** 1-based bar, counted across every written output in play order */
  bar: number
  /** Ticks from the start of the bar */
  tick: number
  /** Ticks from the start of the first written output */
  at: number
  barTicks: number
  key: string
  mode: string
}
export type ChordHit = Where & {
  instrument: string
  input: string
  transpose: number
  label: string
  rootPc: number
  midi: number[]
  pcs: number[]
  bassPc: number
  overBass: boolean
  ticks: number
}
export type NoteHit = Where & {
  instrument: string
  name: string
  midi: number
  pc: number
  ticks: number
}
export type DrumHit = Where & { lane: string; accent: boolean; ghost: boolean }
export type Block = Output["blocks"][number] & { startBar: number }

export type Music = {
  sources: string[]
  errors: { cell: number; line: number; msg: string }[]
  outputs: Output[]
  blocks: Block[]
  bars: number
  keys: string[]
  modes: string[]
  tempos: number[]
  times: string[]
  swing: boolean
  players: Set<string>
  chords: ChordHit[]
  notes: NoteHit[]
  hits: DrumHit[]
}

/** One cell of a notebook in order; `written` marks those the run added or changed */
export type ChainCell = { source: string; written: boolean }

/** Parses the cells in order, each inheriting the state of the one above, and reads back
    what the written ones play. */
export function readCells(chain: ChainCell[]): Music {
  let state = initialState()
  const m: Music = {
    sources: [],
    errors: [],
    outputs: [],
    blocks: [],
    bars: 0,
    keys: [],
    modes: [],
    tempos: [],
    times: [],
    swing: false,
    players: new Set(),
    chords: [],
    notes: [],
    hits: [],
  }
  let at = 0
  for (const cell of chain) {
    const parsed = parseCell(cell.source, state)
    state = parsed.state
    if (!cell.written) continue
    const index = m.sources.push(cell.source) - 1
    for (const e of parsed.errors) m.errors.push({ cell: index, ...e })
    for (const o of parsed.outputs) {
      m.outputs.push(o)
      for (const b of o.blocks) {
        const block = { ...b, startBar: m.bars + 1 }
        m.blocks.push(block)
        const where = (tick: number): Where => ({
          bar: block.startBar + Math.floor(tick / b.barTicks),
          tick: tick % b.barTicks,
          at: at + tick,
          barTicks: b.barTicks,
          key: b.key,
          mode: b.mode,
        })
        for (const e of b.chordEvents)
          m.chords.push({
            ...where(e.tick),
            instrument: e.instrument,
            input: e.chord.input,
            transpose: e.transpose,
            label: e.chord.label,
            rootPc: e.chord.rootPc,
            midi: e.chord.notesMidi,
            pcs: [...new Set(e.chord.notesMidi.map(mod12))].sort((x, y) => x - y),
            bassPc: mod12(e.chord.bassMidi),
            overBass: !!e.chord.overBass,
            ticks: e.ticks,
          })
        for (const e of b.noteEvents)
          m.notes.push({
            ...where(e.tick),
            instrument: e.instrument,
            name: e.note.name,
            midi: e.note.midi,
            pc: mod12(e.note.midi),
            ticks: e.ticks,
          })
        for (const e of b.drumEvents)
          if (!e.hidden)
            m.hits.push({ ...where(e.tick), lane: e.lane, accent: !!e.accent, ghost: !!e.ghost })
        m.bars += b.bars
        at += b.bars * b.barTicks
        if (!m.keys.includes(b.key)) m.keys.push(b.key)
        if (!m.modes.includes(b.mode)) m.modes.push(b.mode)
        if (!m.tempos.includes(b.tempo)) m.tempos.push(b.tempo)
        if (!m.times.includes(b.time)) m.times.push(b.time)
        if (b.swing) m.swing = true
      }
    }
  }
  const order = <T extends Where>(a: T, b: T) => a.at - b.at
  m.chords.sort(order)
  m.notes.sort(order)
  m.hits.sort(order)
  for (const e of [...m.chords, ...m.notes]) m.players.add(e.instrument)
  for (const e of m.hits) m.players.add(e.lane)
  return m
}

/** Parses one cell after the source of the cells it continues from, as the parse tool does */
export function readSource(source: string, after?: string): Music {
  return readCells([
    ...(after ? [{ source: after, written: false }] : []),
    { source, written: true },
  ])
}

// --- Helpers for the cases' checks: each returns the reasons it doesn't hold ---

/** Blocks that sound something pitched, or every block when none does */
function pitchedBlocks(m: Music): Block[] {
  const pitched = m.blocks.filter((b) => b.chordEvents.length || b.noteEvents.length)
  return pitched.length ? pitched : m.blocks
}

export function inKey(m: Music, key: string): string[] {
  const off = [...new Set(pitchedBlocks(m).map((b) => b.key))].filter((k) => pcOf(k) !== pcOf(key))
  return off.length ? [`key ${off.join(", ")}, not ${key}`] : []
}

export function inMode(m: Music, mode: string): string[] {
  const off = [...new Set(pitchedBlocks(m).map((b) => b.mode))].filter((x) => x !== mode)
  return off.length ? [`mode ${off.join(", ")}, not ${mode}`] : []
}

export function atTempo(m: Music, tempo: number): string[] {
  const off = m.tempos.filter((t) => t !== tempo)
  return off.length ? [`tempo ${off.join(", ")}, not ${tempo}`] : []
}

export function inTime(m: Music, time: string): string[] {
  const off = m.times.filter((t) => t !== time)
  return off.length ? [`time ${off.join(", ")}, not ${time}`] : []
}

export function bars(m: Music, n: number): string[] {
  return m.bars === n ? [] : [`${m.bars} bars, not ${n}`]
}

export function atLeastBars(m: Music, n: number): string[] {
  return m.bars >= n ? [] : [`${m.bars} bars, fewer than ${n}`]
}

/** Every listed instrument or kit piece sounds */
export function players(m: Music, ...who: string[]): string[] {
  const missing = who.filter((w) => !m.players.has(w))
  return missing.length
    ? [`${missing.join(", ")} not heard (heard ${[...m.players].join(", ") || "nothing"})`]
    : []
}

export const chordsOf = (m: Music, instrument?: string) =>
  m.chords.filter((c) => !instrument || c.instrument === instrument)
export const notesOf = (m: Music, instrument?: string) =>
  m.notes.filter((n) => !instrument || n.instrument === instrument)
export const hitsOf = (m: Music, ...lanes: string[]) => m.hits.filter((h) => lanes.includes(h.lane))

/** Drops consecutive repeats of the same key */
export function dedupe<T>(xs: T[], keyOf: (x: T) => string | number): T[] {
  return xs.filter((x, i) => i === 0 || keyOf(xs[i - 1]) !== keyOf(x))
}

/** A chord label's quality after its root, without any slash bass: "m7" of "Dm7/F" */
export const suffixOf = (label: string) => label.replace(/^[A-G][#b]?/, "").replace(/\/.*$/, "")

export const within = <T extends Where>(xs: T[], from: number, to: number) =>
  xs.filter((x) => x.bar >= from && x.bar <= to)

/** The music of bars from..to as positions relative to `from`, for comparing sections */
export function barShape<T extends Where>(
  xs: T[],
  from: number,
  to: number,
  what: (x: T) => string,
) {
  return within(xs, from, to)
    .map((x) => `${x.bar - from}:${x.tick}:${what(x)}`)
    .sort()
}

// --- Harmony: is the music derived, by degree, from a seed? ---

const FUNCTIONS = new Set([
  "unison",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "octave",
  "eighth",
  "ninth",
  "tenth",
  "eleventh",
  "twelfth",
  "thirteenth",
  "fourteenth",
  "fifteenth",
])
type Token = { c: string | null; s: string }
const tokensOf = (src: string): Token[][] =>
  highlightMusic(src).map((line) => line.filter((t) => t.c !== null && !t.c.includes("tk-comment")))

const isPitch = (t: Token) => !!t.c && /\btk-(root|note)\b/.test(t.c)

/** The typed chord roots and notes of the sources, or only one kind */
export function typedPitches(sources: string[], only?: "tk-root" | "tk-note"): string[] {
  const keep = (t: Token) => isPitch(t) && (!only || !!t.c?.split(" ").includes(only))
  return sources.flatMap((s) => tokensOf(s).flatMap((l) => l.filter(keep).map((t) => t.s)))
}

const LETTER = /^[\^~]?[A-G]/

export function letterNamed(sources: string[]): string[] {
  return typedPitches(sources).filter((s) => LETTER.test(s))
}

export function letterNamedRoots(sources: string[]): string[] {
  return sources.flatMap((s) =>
    tokensOf(s).flatMap((l) =>
      l.filter((t) => t.c?.includes("tk-root") && LETTER.test(t.s)).map((t) => t.s),
    ),
  )
}

/** Expanded chord inputs come from the engine, so unused declarations and note-only
    functions cannot stand in for deriving the chords that actually play. */
function usesChordFunction(m: Music): boolean {
  return m.chords.some((c) =>
    [...c.input.matchAll(/\b([a-z]+)\s*\(/g)].some((match) => FUNCTIONS.has(match[1])),
  )
}

/** The same symbolic chart and rhythm sounding under different keys or modes. This
    also accepts a chart carried by a named pattern or inherited from an earlier cell. */
function reusesChart(m: Music): boolean {
  const settingsByChart = new Map<string, Set<string>>()
  for (const b of m.blocks) {
    if (!b.chordEvents.length) continue
    const chart = JSON.stringify(
      b.chordEvents.map((e) => [e.tick / b.barTicks, e.ticks / b.barTicks, e.chord.input]),
    )
    const settings = settingsByChart.get(chart) ?? new Set<string>()
    settings.add(`${pcOf(b.key)} ${b.mode}`)
    if (settings.size >= 2) return true
    settingsByChart.set(chart, settings)
  }
  return false
}

/** Notes standing in for a chord: two starting together on one instrument, or three across all */
export function stackedNotes(m: Music): string | null {
  const byMoment = new Map<number, typeof m.notes>()
  for (const n of m.notes) byMoment.set(n.at, [...(byMoment.get(n.at) ?? []), n])
  for (const notes of byMoment.values()) {
    const { bar, tick } = notes[0]
    const names = notes.map((n) => `${n.instrument} ${n.name}`).join(", ")
    const instruments = notes.map((n) => n.instrument)
    if (new Set(instruments).size < instruments.length || notes.length >= 3)
      return `stacked notes: ${names} start together in bar ${bar} at tick ${tick}`
  }
  return null
}

const CYCLES = [
  [0, 7, 9, 5],
  [0, 9, 5, 7],
  [9, 5, 0, 7],
  [0, 8, 3, 10],
  [3, 10, 0, 8],
  [3, 0, 8, 10],
]

/** The chord roots as semitones from the key they sound in, consecutive repeats dropped */
export function rootDegrees(m: Music): number[] {
  return dedupe(
    m.chords.map((c) => mod12(c.rootPc - pcOf(c.key))),
    (x) => x,
  )
}

export function stockLoop(seq: number[]): number[] | null {
  if (seq.length < 4 || seq.length % 4) return null
  return CYCLES.find((cycle) => seq.every((x, i) => x === cycle[i % 4])) ?? null
}

const KEY_IN = /\bkey\s+([A-G][#b]?)(?=[\s,{}]|$)/g

/** The source with every `key X` in a set or a with moved up `semitones`; null if none */
function transposeKeys(src: string, semitones: number): string | null {
  let moved = false
  const out = src
    .split("\n")
    .map((line) => {
      if (!/^\s*set\s+key\b/.test(line) && !/\bwith\b/.test(line)) return line
      return line.replace(KEY_IN, (_all, note: string) => {
        moved = true
        return `key ${NOTE_NAMES[mod12(pcOf(note) + semitones)]}`
      })
    })
    .join("\n")
  return moved ? out : null
}

// Moves every key two semitones up and reads the music again: every pitch must follow.
function notTransposed(chain: ChainCell[], m: Music): string | null {
  const lastWritten = chain.map((c) => c.written).lastIndexOf(true)
  const upto = chain.slice(0, lastWritten + 1)
  const shifted = upto.map((c) => ({ ...c, source: transposeKeys(c.source, 2) ?? c.source }))
  // Move the implicit C too, including music outside an explicit `with key` scope.
  shifted.unshift({ source: "set key D", written: false })
  const t = readCells(shifted)
  if (t.errors.length > m.errors.length)
    return `moving the key up a whole step gives errors (${t.errors[0].msg})`
  if (t.chords.length !== m.chords.length || t.notes.length !== m.notes.length)
    return `${m.chords.length} chords and ${m.notes.length} notes become ${t.chords.length} and ${t.notes.length} a whole step up`
  const fixedChord = m.chords.findIndex(
    (c, i) =>
      mod12(c.rootPc + 2) !== t.chords[i].rootPc ||
      (c.overBass && mod12(c.bassPc + 2) !== t.chords[i].bassPc) ||
      c.midi.length !== t.chords[i].midi.length ||
      c.midi.some((x, j) => mod12(x + 2) !== mod12(t.chords[i].midi[j])),
  )
  if (fixedChord >= 0)
    return `chord ${fixedChord + 1} (${m.chords[fixedChord].label}) became ${t.chords[fixedChord].label}, not a whole step up`
  const fixedNote = m.notes.findIndex((n, i) => mod12(n.midi + 2) !== t.notes[i].pc)
  if (fixedNote >= 0)
    return `note ${fixedNote + 1} (${m.notes[fixedNote].name}) became ${t.notes[fixedNote].name}, not a whole step up`
  return null
}

/** Why the written music isn't derived from a seed, one entry per failed sub-check of
    CASES.md, each starting with its name; empty when it is */
export function notDerived(chain: ChainCell[], m: Music): string[] {
  const out: string[] = []
  const letters = letterNamed(m.sources)
  if (letters.length)
    out.push(`letters: typed letter-named pitches ${letters.slice(0, 8).join(" ")}`)

  if (!m.chords.length) out.push("chords: no chords sound")
  if (!usesChordFunction(m) && !reusesChart(m))
    out.push(
      "functions: no sounding chord uses an interval function or a chart reused in another key or mode",
    )

  const roots = typedPitches(m.sources, "tk-root").length
  const sounding = m.chords.length
  if (roots > sounding / 2)
    out.push(`seed: ${roots} chord roots typed for ${sounding} chords that sound`)

  const stacked = stackedNotes(m)
  if (stacked) out.push(stacked)

  const moved = notTransposed(chain, m)
  if (moved) out.push(`transposes: ${moved}`)

  const loop = stockLoop(rootDegrees(m))
  if (loop)
    out.push(`not a stock loop: the roots are ${loop.join(" ")} (semitones from the key) on repeat`)
  return out
}

/** Typed chord roots and notes over the chords and notes that sound; null if nothing pitched */
export function typedRatio(m: Music): number | null {
  const sounding = m.chords.length + m.notes.length
  if (!sounding) return null
  return Math.min(1, typedPitches(m.sources).length / sounding)
}

// --- Grading ---

export type Case = CaseBase & { fits(music: Music, run: Run): string[] }

const WRITES = new Set(["create_notebook", "add_music_cell", "update_music_cell"])
const MUSIC_WRITES = new Set(["new", "append", "edit"])

const isWrite = (name: string) => WRITES.has(name)
const blank = (s: string) => !s.trim()
const sameCell = (a: DocumentCell, b: DocumentCell) => isDeepStrictEqual(a, b)
const byId = (notebooks: NotebookDocument[], id: string) => notebooks.find((n) => n.id === id)

/** Error lines in a refused write or failed parse */
function errorCount(text: string): number {
  const m = /(?:^|\n|Not saved\. )(\d+) errors?\./.exec(text)
  if (m) return Number(m[1])
  return (text.match(/^\s*line \d+/gm) ?? []).length
}

type Account = { ok: string | null; chain: ChainCell[] }

const asChain = (cells: DocumentCell[], written: (c: DocumentCell) => boolean): ChainCell[] =>
  cells.filter((c) => c.type === "music").map((c) => ({ source: c.source, written: written(c) }))

/** Whether the account ended as the case says, and the notebook the music sits in */
function account(c: Case, run: Run): Account {
  const { before, after } = run
  const created = after.filter((n) => !byId(before, n.id))
  const gone = before.filter((n) => !byId(after, n.id))
  const none = { ok: null, chain: [] }
  if (c.writes === "none")
    return isDeepStrictEqual(after, before) ? none : { ok: "the account changed", chain: [] }
  if (gone.length) return { ok: `notebook ${gone[0].title} was removed`, chain: [] }

  if (c.writes === "new") {
    const changed = before.filter((n) => !isDeepStrictEqual(n, byId(after, n.id)))
    if (changed.length) return { ok: `existing notebook ${changed[0].title} changed`, chain: [] }
    if (created.length !== 1) return { ok: `${created.length} notebooks created, not 1`, chain: [] }
    return {
      ok: null,
      chain: asChain(created[0].cells, (cell) => !blank(cell.source)),
    }
  }

  if (created.length) return { ok: `a notebook was created (${created[0].title})`, chain: [] }
  const open = STATES[c.state].open
  if (!open) throw new Error(`case ${c.id}: state ${c.state} has no open notebook`)
  const others = before.filter((n) => n.id !== open.notebookId)
  const touched = others.find((n) => !isDeepStrictEqual(n, byId(after, n.id)))
  if (touched) return { ok: `notebook ${touched.title} changed`, chain: [] }
  const was = byId(before, open.notebookId)!.cells
  const now = byId(after, open.notebookId)!.cells

  if (c.writes === "append" || c.writes === "empty-cell") {
    const kept = was.every((cell, i) => now[i] && sameCell(cell, now[i]))
    if (!kept) return { ok: "a cell that was there changed or moved", chain: [] }
    const added = now.slice(was.length)
    if (c.writes === "empty-cell") {
      if (added.length !== 1) return { ok: `${added.length} cells added, not 1`, chain: [] }
      if (!blank(added[0].source)) return { ok: "the added cell isn't empty", chain: [] }
      return none
    }
    if (added.length !== 1) return { ok: `${added.length} cells added, not 1`, chain: [] }
    const ids = new Set(added.filter((x) => !blank(x.source)).map((x) => x.id))
    return { ok: null, chain: asChain(now, (cell) => ids.has(cell.id)) }
  }

  // edit
  if (
    !isDeepStrictEqual(
      was.map((x) => x.id),
      now.map((x) => x.id),
    )
  )
    return { ok: "the notebook's cells were added, removed or reordered", chain: [] }
  const other = now.find((cell, i) => cell.id !== open.cellId && !sameCell(cell, was[i]))
  if (other) return { ok: `cell ${other.id} changed too`, chain: [] }
  const target = now.find((x) => x.id === open.cellId)!
  if (target.source === was.find((x) => x.id === open.cellId)!.source)
    return { ok: "the open cell is unchanged", chain: [] }
  return { ok: null, chain: asChain(now, (cell) => cell.id === open.cellId) }
}

export function grade(c: Case, run: Run): Grade {
  const scores: Record<string, number> = {}
  const explanation: Record<string, string> = {}
  const fail = (id: string, why: string) => {
    scores[id] = 0
    explanation[id] = why
  }
  const musicWriting = MUSIC_WRITES.has(c.writes)

  // saved
  const acct = account(c, run)
  const music = readCells(acct.chain)
  let savedWhy = acct.ok
  if (!savedWhy && musicWriting) {
    if (!music.sources.length) savedWhy = "no music was written"
    else if (music.errors.length)
      savedWhy = `the written cells have errors: line ${music.errors[0].line}: ${music.errors[0].msg}`
    else if (!music.outputs.length) savedWhy = "the written cells play nothing"
  }
  if (savedWhy) fail("saved", savedWhy)
  else scores.saved = 1

  // fits
  if (musicWriting && savedWhy) fail("fits", "nothing to check")
  else {
    const why = c.fits(music, run)
    if (why.length) fail("fits", why.join("; "))
    else scores.fits = 1
  }

  // harmony
  if (c.harmony === "literal") {
    const stacked = stackedNotes(music)
    if (!scores.fits) fail("harmony", "the chords or notes asked for don't sound")
    else if (stacked) fail("harmony", stacked)
    else scores.harmony = 1
  } else if (c.harmony === "derive") {
    if (savedWhy) fail("harmony", "nothing to check")
    else {
      const why = notDerived(acct.chain, music)
      if (why.length) fail("harmony", why.join("; "))
      else scores.harmony = 1
    }
  }

  // typed_ratio
  if (c.harmony && musicWriting && !savedWhy) {
    const ratio = typedRatio(music)
    if (ratio !== null) scores.typed_ratio = ratio
  }

  // first_try and the counts
  const calls = run.calls
  const writes = calls.filter((x) => isWrite(x.name))
  if (writes.length) {
    if (writes[0].isError) fail("first_try", "the first write was refused")
    else scores.first_try = 1
  }
  const firstSave = calls.findIndex((x) => isWrite(x.name) && !x.isError)
  const beforeSave = firstSave < 0 ? calls : calls.slice(0, firstSave)
  const afterSave = firstSave < 0 ? [] : calls.slice(firstSave + 1)
  const redundant = [
    ...(c.writes !== "none" ? beforeSave.filter((x) => x.name === "parse") : []),
    ...(c.state === "empty" && c.writes === "new"
      ? beforeSave.filter((x) =>
          ["list_notebooks", "get_notebook", "open_notebook"].includes(x.name),
        )
      : []),
    ...(c.writes === "empty-cell" ? beforeSave.filter((x) => x.name === "get_notebook") : []),
    ...afterSave.filter((x) => x.name === "open_notebook"),
  ]
  const perf: Grade["perf"] = {
    tool_calls: calls.length,
    failed_writes: writes.filter((x) => x.isError && x.result.includes("Not saved.")).length,
    dsl_errors: calls
      .filter((x) => x.isError && (isWrite(x.name) || x.name === "parse"))
      .reduce((n, x) => n + errorCount(x.result), 0),
    redundant_calls: redundant.length,
    lookups: calls.filter((x) => ["reference", "library", "Skill", "ToolSearch"].includes(x.name))
      .length,
    tool_errors: calls.filter((x) => x.isError).length,
  }

  // pass
  const failed: string[] = []
  if (!scores.saved) failed.push("not saved as expected")
  if (!scores.fits) failed.push("doesn't fit")
  if ("harmony" in scores && !scores.harmony) failed.push("harmony")
  if (perf.failed_writes > MAX_FAILED_WRITES) failed.push(`${perf.failed_writes} refused writes`)
  if (perf.redundant_calls)
    failed.push(`redundant calls: ${redundant.map((x) => x.name).join(", ")}`)
  if (failed.length) fail("pass", failed.join("; "))
  else scores.pass = 1

  return { scores, explanation, perf }
}
