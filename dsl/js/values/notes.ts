/* Notes: what a pitched instrument's line draws on the steps. A note is a letter (E, F#4)
   or a degree of the key (biii, v'), or a degree of another note (v of C3); - lets it ring
   and _ stops it. Parts with lengths hold one note (3 beats C2), and ... holds one to the
   end. A block holds layers that sound together, each a voice of its own. */
import {
  buildChord,
  degreeSemitones,
  isRoman,
  letterStep,
  midiToName,
  NUMERALS,
  pastScale,
  pastScaleMessage,
} from "../chords.ts"
import { misplaced } from "../check.ts"
import { CHORDS_BLOCK } from "../declare.ts"
import { bracesIn, headOf, onlyBraces, textOf } from "../parts.ts"
import { TRACK_RE } from "../lines.ts"
import { keyOf, withInLayers } from "../settings.ts"
import { NAME_LIKE } from "../resolve.ts"
import type { Line, Piece, State } from "../state.ts"
import { lcm, lengthAt, MAX_BARS, meterOf, nearWhole, sayTicks, TPQ, type Report } from "../time.ts"
import { UNITS } from "../vocab.ts"
import {
  CHORD_MARKS,
  chordPattern,
  type ChartClip,
  type ChordEvent,
  type Key,
  type Part,
} from "./chart.ts"
import { barLineProblem, isOf, openParens, partsOf, tokenize } from "./steps.ts"

const UNITS_ANY: readonly string[] = UNITS

// One step of a line of notes: null for -, { cut } for _, or a note. A note by name has
// `name` and `octave`; a degree has `degree`, `acc` (b or #) and `shift` (octaves up), and
// may count from another note (`of`). ^ or ~ in front makes it `accent` or `ghost`.
export type NoteStep = {
  cut?: boolean
  name?: string
  octave?: number | null
  degree?: number
  acc?: string
  shift?: number
  label?: string
  accent?: boolean
  ghost?: boolean
  of?: NoteStep
}
type Step = NoteStep | null
// A line of notes read, as tokens with its lengths written out, then as steps: whether it
// ends in ..., and what fills the rest when it does
type NoteParts = { tokens: string[]; open: boolean; fill: NoteStep | null }
type Voice = { steps: Step[]; open?: boolean; fill?: NoteStep | null }
// A pitched instrument's line: its name, where it is, and what it holds
export type PitchedPart = Part & { value: Piece[] }
// One note, as it sounds
export type NoteEvent = {
  tick: number
  ticks: number
  note: { midi: number; name: string; spell?: { letter: string; alter: number } }
  transpose?: number
  label: string
  instrument: string
  sound?: string
  voice: number
  vel: number
  accent?: boolean
  ghost?: boolean
  repeat: boolean
  line: number
}
// A line or a block of lines a pitched instrument plays, read
export type PitchedClip = {
  kind: "pitched"
  ticks: number
  open?: boolean
  expand(total: number, loop: boolean): (NoteEvent | ChordEvent)[]
}

const NOTE_BASE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const LETTERS = "CDEFGAB"

// How a note is spelt, for the sheet: its letter and how far that is raised or lowered. A
// letter note is spelt as written, so Db stays Db. A degree takes the letter of its place in
// the scale, counted from the key's root, so biii in C is Eb and vii in F# is E#.
function spellOf(s: NoteStep, midi: number, key: Key) {
  const letter = letterOf(s, key)
  return { letter, alter: ((((midi - NOTE_BASE[letter]) % 12) + 18) % 12) - 6 }
}
// A note's letter: as written, or for a degree the letter of its place in the scale it
// counts on, the key's or, after of, its root's: 3 of D is an F.
function letterOf(s: NoteStep, key: Key): string {
  if (!s.degree) return s.name![0]
  const from = s.of ? letterOf(s.of, key) : key.root[0]
  return LETTERS[(LETTERS.indexOf(from) + (s.of ? s.degree - 1 : letterStep(key, s.degree))) % 7]
}
// A note as its letter, accidental and octave: v of C3 is G3, iii of (v of D3) is C#4.
function spelledName(s: NoteStep, midi: number, key: Key): string {
  const { letter, alter } = spellOf(s, midi, key)
  return (
    letter +
    (alter > 0 ? "#".repeat(alter) : "b".repeat(-alter)) +
    (Math.floor((midi - alter) / 12) - 1)
  )
}
// A note (F#4), or a degree (biii): ^ or ~ in front; then for a note the letter, # or b and
// the octave; for a degree ' for each octave below, b or # and the Roman numeral, i to vii,
// and ' for each octave above. A degree is counted on the key's own scale, its mode's: in
// minor i to vii is the natural minor scale, and b or # moves a degree off it. A numeral is
// as long as it reads, so iii is one note, and two in a row take a space: i i.
const NOTE_AT = /([\^~])?(?:([A-G])([#b])?(\d)?|('*)([#b])?(vii|vi|iv|v|iii|ii|i)('*))/y
export const NOTE_HELP =
  "Notes are A to G, with # or b after them and an octave when it's needed (F, F#, Bb, E2), or degrees of the key as Roman numerals, i to vii (i, biii, v, i')"

// One note at `i` in `run`: a note by name, a degree, or a degree of another note, counted on
// that note's major scale (v of C3, biii of (v of C3)), with ^ or ~ in front. Returns
// { step, end }, or null when there isn't one, or when a chain of of's has no brackets
// (v of v of C3).
function noteAt(run: string, i: number): { step: NoteStep; end: number } | null {
  NOTE_AT.lastIndex = i
  const m = NOTE_AT.exec(run)
  if (!m || m[4] === "9") return null
  const mods = { accent: m[1] === "^", ghost: m[1] === "~" }
  const end = NOTE_AT.lastIndex
  const step: NoteStep = m[2]
    ? {
        name: m[2] + (m[3] || ""),
        octave: m[4] ? Number(m[4]) : null,
        label: m[2] + (m[3] || "") + (m[4] || ""),
      }
    : {
        degree: NUMERALS.indexOf(m[7]) + 1,
        acc: m[6] || "",
        shift: m[8].length - m[5].length,
        label: m[5] + (m[6] || "") + m[7] + m[8],
      }
  if (!/^ of( |$)/.test(run.slice(end))) return { step: { ...step, ...mods }, end }
  if (!step.degree) return null
  const from = end + 4 // past " of "
  let root: NoteStep
  let rootEnd: number
  if (run[from] === "(") {
    let depth = 0
    let close = -1
    for (let j = from; j < run.length && close < 0; j++) {
      if (run[j] === "(") depth++
      else if (run[j] === ")" && --depth === 0) close = j
    }
    if (close < 0) return null
    const text = run.slice(from + 1, close)
    const inner = noteAt(text, 0)
    if (!inner || inner.end !== text.length) return null
    root = inner.step
    rootEnd = close + 1
  } else {
    const plain = noteAt(run, from)
    if (!plain || plain.step.of) return null
    root = plain.step
    rootEnd = plain.end
  }
  if (root.accent || root.ghost) return null
  return {
    step: { ...step, of: root, label: step.label + run.slice(end, rootEnd), ...mods },
    end: rootEnd,
  }
}

// A run of notes (E---F#, i---biii---) → its steps: one for each note, - or _, however many
// characters a note takes. A step is null for -, { cut } for _, or the note, with whether
// ^ or ~ is in front of it: a note by name ({ name, octave }) or a degree ({ degree, acc,
// shift }, where shift is octaves up), which may count from another note (`of`). null when
// it isn't a run of notes.
export function noteSteps(run: string): Step[] | null {
  const steps: Step[] = []
  for (let i = 0; i < run.length; ) {
    if (run[i] === "-" || run[i] === "_") {
      steps.push(run[i] === "_" ? { cut: true } : null)
      i++
      continue
    }
    const n = noteAt(run, i)
    if (!n) return null
    steps.push(n.step)
    i = n.end
  }
  return steps.length ? steps : null
}

// A note's step as it's written: ^C2, biii'
const writtenNote = (s: NoteStep) => (s.accent ? "^" : s.ghost ? "~" : "") + s.label

// The shortest run `s` repeats, when it is nothing but that run more than once: x-x-x-x-
// is x- four times. 0 when it isn't a repeat.
export function period(s: string): number {
  for (let p = 1; p <= s.length / 2; p++) {
    if (s.length % p === 0 && s === s.slice(0, p).repeat(s.length / p)) return p
  }
  return 0
}

// A run grouped by fours, for a message: x-x-x-x- → x-x- x-x-
export const grouped = (run: string) => (run.length > 4 ? run.match(/.{1,4}/g)!.join(" ") : run)

// `run` with a space between each two notes that touch (F#E → F# E), or null when it isn't
// notes or no two notes touch. Notes don't touch, because a note takes one to four
// characters, and where one ends and the next begins can't be seen (F#E, E2G2, ^F^G).
export function spacedNotes(run: string): string | null {
  let out = ""
  let touched = false
  let afterNote = false
  for (let i = 0; i < run.length; ) {
    if (run[i] === "-" || run[i] === "_") {
      out += run[i++]
      afterNote = false
      continue
    }
    NOTE_AT.lastIndex = i
    const m = NOTE_AT.exec(run)
    if (!m) return null
    if (afterNote) touched = true
    out += (afterNote ? " " : "") + m[0]
    afterNote = true
    i = NOTE_AT.lastIndex
  }
  return touched ? out : null
}

// `text` with the notes in it spaced apart, for showing in a message as the line to write.
export const spaceNotes = (text: string) => text.replace(/[^\s|,{}]+/g, (w) => spacedNotes(w) || w)

export const notesTouch = (run: string, spaced: string) =>
  `"${run}": notes don't touch, so put a space between them: ${spaced}`

// Whether a token can only be notes drawn on steps: more than one step, with a note among
// them (F---G, E2 G2, i---iii). One letter on its own could be a chord's name, so it isn't
// told here.
export function drawsNotes(tok: string): boolean {
  const steps = noteSteps(tok)
  return !!steps && steps.length > 1 && steps.some((s) => s && !s.cut) && /[A-G_-]/.test(tok)
}

// A pitched instrument's line of notes, part by part. Commas separate the parts: a figure
// drawn on the steps (E4---F4-), a length and one note (3 beats C2), which holds the note
// that long, a length and rest, or ... and one note or rest, which is the rest of the
// block the line is in: ...G1 holds G1 to the end, ...rest is silence to the end. A length
// holds one note because a note has a duration; on a drum's line the same length repeats a
// figure, because a hit has none. The parts come back as the runs they stand for, with
// names and bar lines kept as they are ({ tokens, open, fill }), or null after saying
// what's wrong. A value drawn as the same figure more than once is a mistake: a pattern
// repeats it. `part` is the line's instrument, or null for a name's value.
export function noteParts(
  value: string,
  st: State,
  err: Report,
  ln: number,
  part: PitchedPart | null,
): NoteParts | null {
  const fail = (msg: string) => {
    err(ln, msg)
    return null
  }
  const parts = partsOf(value)
  const { barTicks } = meterOf(st)
  const tokens: string[] = []
  let open = false
  let fill: NoteStep | null = null
  let drawn = 0 // how many parts were drawn on the steps
  let run: string | null = "" // what they drew, names written out, for the repeat check
  // The one note a length or ... holds, or null after saying what was written instead
  const oneNote = (text: string, shown: string): NoteStep | null => {
    const steps = noteSteps(text)
    if (steps?.length === 1 && steps[0] && !steps[0].cut) return steps[0]
    const w = st.words[text]
    return fail(
      w
        ? `${shown} holds one note, and ${text} is a name. Draw ${text} on the steps, without the length`
        : steps
          ? `${shown} holds one note. To draw a figure, leave the length off: ${spaceNotes(text)}`
          : `${shown} needs one note or rest after it: ${shown} C2, ${shown} rest`,
    )
  }
  for (const [i, text] of parts.entries()) {
    if (!text)
      return fail("A comma goes between two parts of a line, so something goes on each side")
    const toEnd = /^\.\.\.\s*(.*)$/.exec(text)
    if (toEnd) {
      if (i < parts.length - 1)
        return fail("... is the rest of the block, so nothing goes after it")
      const thing = toEnd[1].trim()
      if (!thing) {
        return fail(
          "... needs what fills the rest of the block: ...rest, or a note held to the end: ...G1",
        )
      }
      if (thing === "rest") {
        if (parts.length === 1) {
          return fail(
            "...rest on its own plays nothing. Put notes in front of it: E4---F4---, ...rest",
          )
        }
        fill = { cut: true }
      } else {
        const s = oneNote(thing, "...")
        if (!s) return null
        fill = s
      }
      open = true
      continue
    }
    if (text.includes("...")) {
      return fail(
        `... starts its own part, so a comma goes before it: ${text.replace(/\s*\.\.\./, ", ...")}`,
      )
    }
    const len = lengthAt(text)
    if (!len) {
      const toks = tokenize(text)
      const unit = toks.findIndex((t) => UNITS_ANY.includes(t))
      if (unit > 0) {
        const [before, length] = [toks.slice(0, unit - 1), toks.slice(unit - 1)]
        return fail(
          before.length
            ? `A length starts its own part, so put a comma before it: ${before.join(" ")}, ${length.join(" ")}`
            : `${length.slice(0, 2).join(" ")} needs a number in front: 2 ${toks[unit]} rest`,
        )
      }
      if (unit === 0) return fail(`${toks[0]} needs a number in front: 2 ${toks[0]} rest`)
      if (toks.includes("rest")) {
        return fail(
          "rest takes a length in front: 2 beats rest, or ...rest for the rest of the block. One step of silence is _",
        )
      }
      tokens.push(...toks)
      drawn++
      for (const t of toks) {
        if (t === "|" || run === null) continue
        const w = st.words[t]
        if (w?.type === "notes") run += w.tokens.filter((x) => x !== "|").join(" ") + " "
        else if (noteSteps(t)) run += t + " "
        else run = null // a name or a mistake, said where it's read: no repeat check
      }
      continue
    }
    const unitTicks = (
      { steps: st.stepTicks, beats: TPQ, bars: barTicks } as Record<string, number>
    )[len.unit]
    const steps = (len.n * unitTicks) / st.stepTicks
    if (!(len.n > 0) || len.n * unitTicks > MAX_BARS * barTicks) {
      return fail(`A length is more than nothing, and up to ${MAX_BARS} bars: 2 beats rest`)
    }
    if (!nearWhole(steps)) {
      return fail(`${len.shown} isn't a whole number of steps, so a note can't fill it`)
    }
    const n = Math.round(steps)
    if (!len.thing) {
      return fail(
        `${len.shown} of what? Write ${len.shown} rest, or the note it holds: ${len.shown} C2`,
      )
    }
    if (len.thing === "rest" || /^rest\s*\|$/.test(len.thing)) {
      tokens.push("_" + "-".repeat(n - 1))
      if (len.thing !== "rest") tokens.push("|")
      continue
    }
    // 1 bars F2 | 1 bars G2: a bar line may end a length's part, and is checked there
    const things = tokenize(len.thing)
    const bar = things.at(-1) === "|" && things.length > 1 ? things.pop() : null
    if (things.length > 1) {
      return fail(
        `A comma ends a length, so put one here: ${len.shown} ${things[0]}, ${things.slice(1).join(" ")}`,
      )
    }
    const s = oneNote(things[0], len.shown)
    if (!s) return null
    tokens.push(writtenNote(s) + "-".repeat(n - 1))
    if (bar) tokens.push(bar)
  }
  if (drawn === parts.length && !open && run && !/^[-_\s]*$/.test(run)) {
    const p = noteRunPeriod(run)
    if (p) {
      const short = spaceNotes(run.replace(/\s/g, "").slice(0, p))
      const head = part ? `${part.name}: notes ` : ""
      return fail(`${head}${value} repeats ${short}. Write ${head}${short}: a pattern repeats it`)
    }
  }
  return { tokens, open, fill }
}

// The shortest run of notes `run` repeats, in characters, counted at note boundaries so
// that C2-C2- repeats C2- and C2-C2-- doesn't. 0 when it isn't a repeat.
function noteRunPeriod(run: string): number {
  const steps = tokenize(run).flatMap((t): Step[] => noteSteps(t) || [{ name: t, label: t }])
  if (!steps.length) return 0
  const written = steps.map((s) => (!s ? "-" : s.cut ? "_" : writtenNote(s)))
  for (let p = 1; p <= written.length / 2; p++) {
    if (written.length % p) continue
    if (written.every((w, i) => w === written[i % p])) return written.slice(0, p).join("").length
  }
  return 0
}

// Why `tok` isn't notes, on `inst`'s line. `chart` is the line to write if these are chords.
export function notNotes(tok: string, st: State, inst: string, chart: string): string {
  if (isOf(tok)) {
    const at = tok.indexOf(" of")
    const right = tok.slice(at + 4)
    if (!/^[\^~]?'*[#b]?(vii|vi|iv|v|iii|ii|i)'*$/.test(tok.slice(0, at))) {
      return "of takes a degree in front of it, counted on the major scale of the note after it: v of C3"
    }
    if (right.startsWith("(") && openParens(right) > 0) {
      return "The ( after of closes on its line: v of (v of C3)"
    }
    if (!right.startsWith("(") && isOf(right))
      return "A chain of of's takes brackets: v of (v of C3)"
    return "After of goes the note to count from: v of C3, or a degree of the key: v of ii"
  }
  if (/^[-_^~A-G#b\d]+$/.test(tok) && /[A-G][#b]?9/.test(tok)) {
    return `"${tok}": octaves run from 0 to 8`
  }
  if (/^[-_^~'#b]*\d/.test(tok) && /^[-_^~'#b\d]+$/.test(tok) && !/[A-G]/.test(tok)) {
    // A degree is a Roman numeral, as a chord's is: 1---3---5 is i---iii---v
    const numerals = tok.replace(/\d/g, (d, at) =>
      /[1-7]/.test(d) ? (/\d/.test(tok[at - 1] || "") ? " " : "") + NUMERALS[Number(d) - 1] : d,
    )
    return /[089]/.test(tok)
      ? `"${tok}": degrees are the Roman numerals i to vii, counted on the key's scale. The octave above i is i'`
      : `"${tok}": degrees are Roman numerals, as a chord's are: ${numerals}`
  }
  if (/^[-_x^~d]+$/.test(tok)) {
    return /[xd]/.test(tok)
      ? `"${tok}" is a drum's steps. On ${inst} a step is a note: ${inst}: notes F---G---`
      : `"${tok}": ^ and ~ go in front of a note: ^F, ~G`
  }
  if (/^[-_^~a-g#\d']+$/.test(tok) && /[a-g]/.test(tok) && (tok.length === 1 || /[-_]/.test(tok))) {
    return `"${tok}": notes are capital letters, A to G: ${inst}: notes F---G---`
  }
  if (st.sections[tok]) {
    return misplaced(tok, "pattern", { line: "pitched", part: inst, text: "", chart: false })!
  }
  if (NAME_LIKE.test(tok) && !isRoman(tok)) {
    return `"${tok}" isn't defined above. Name it first: notes ${tok} = F---G---`
  }
  if (buildChord(tok, keyOf(st)!)) {
    return `"${tok}" is a chord, and these are notes. For chords, write ${chart}`
  }
  if (/[A-G][#b]?(m|M|maj|min|sus|dim|aug|add|\+|°|ø)/.test(tok)) {
    return (
      `"${tok}": chord names don't go on the steps. Chords are written in a chart, ` +
      `where _ leaves a slot silent: ${inst}: chords _ Am _ Am`
    )
  }
  return `"${tok}" isn't a note. ${NOTE_HELP}`
}

// One line of notes: its parts (noteParts), which are runs of notes and names of notes in
// a row, with the lengths among them written out. Returns { steps, open, fill }, where
// `open` is a line ended in ... and `fill` what fills the rest of it, or null after saying
// what's wrong.
function noteVoice(line: Line, part: PitchedPart, st: State, err: Report): Voice | null {
  const text = textOf(line.parts)
  if (bracesIn(line.parts).length) {
    err(
      line.ln,
      `A block is everything ${part.name} plays, so nothing goes beside it: ${part.name}: { ... }`,
    )
    return null
  }
  const parts = noteParts(text, st, err, line.ln, part)
  if (!parts) return null
  const steps: Step[] = []
  let ok = true
  const fail = (msg: string) => {
    err(line.ln, msg)
    ok = false
  }
  // guitar: C G|F G reads as four notes, a step each, where a chart was probably meant
  const key = keyOf(st)!
  const chart = tokenize(text).every(
    (t) => CHORD_MARKS.includes(t) || st.words[t]?.type === "chords" || buildChord(t, key),
  )
  const barLine = () => {
    const problem = ok && barLineProblem(steps.length, st)
    if (!problem) return
    fail(
      chart ? `${problem}. For chords, put chords in front: ${part.name}: chords ${text}` : problem,
    )
  }
  const add = (tok: string, viaWord?: string) => {
    const run = noteSteps(tok)
    const spaced = run && spacedNotes(tok)
    // A degree counts on the key's scale, and whole tone has six notes: no 7 in it
    const past = run?.some((s) => {
      if (!s) return false
      while (s.of) s = s.of
      return s.degree !== undefined && pastScale(key, s.degree)
    })
    if (past) fail(`"${tok}": ${pastScaleMessage(key)}`)
    else if (spaced) fail(notesTouch(tok, spaced))
    else if (run) steps.push(...run)
    else if (viaWord) fail(`"${tok}" (in ${viaWord}) isn't a note. ${NOTE_HELP}`)
    else fail(notNotes(tok, st, part.name, `${part.name}: chords ${text}`))
  }
  for (const tok of parts.tokens) {
    const w = st.words[tok]
    if (tok === "|") barLine()
    else if (!w) add(tok)
    else {
      const problem = misplaced(tok, w.type, {
        line: "pitched",
        part: part.name,
        text,
        chart,
      })
      if (problem) fail(problem)
      else for (const t of w.tokens) t === "|" ? barLine() : add(t, tok)
    }
  }
  if (ok && !steps.length && !parts.fill) {
    fail(`${part.name} has nothing to play`)
  }
  return ok ? { steps, open: parts.open, fill: parts.fill } : null
}

// What one line of notes plays. A note sounds until the next note or _ on its line: -
// means nothing new happens, as it does on a drum's line. A degree is counted from the
// key's root in the current octave. An `open` line (ended in ...) plays its steps once and
// then `fill`, a note held to the end or silence, and has no length of its own.
function notePattern(
  part: PitchedPart,
  { steps, open = false, fill = null }: Voice,
  st: State,
): PitchedClip {
  const stepTicks = st.stepTicks
  const octave = st.octave
  const key = keyOf(st)!
  const sound = st.sounds[part.name]
  const sharp: Record<string, number> = { "#": 1, b: -1 }
  // What's written, and what sounds: set transpose moves the sound, not the writing
  const written = (s: NoteStep): number =>
    s.of
      ? written(s.of) + 12 * s.shift! + degreeSemitones(s.degree!, s.acc)
      : s.degree
        ? 12 * (octave + 1 + s.shift!) +
          key.tonicSemis +
          degreeSemitones(s.degree, s.acc, key.scale)
        : 12 * ((s.octave ?? octave) + 1) + NOTE_BASE[s.name![0]] + (sharp[s.name![1]] || 0)
  const transpose = st.transpose
  const midiOf = (s: NoteStep) => written(s) + transpose
  return {
    kind: "pitched",
    open,
    ticks: steps.length * stepTicks,
    expand(total: number, loop: boolean) {
      const end = loop || open ? total : Math.min(total, steps.length * stepTicks)
      const out: NoteEvent[] = []
      let cur: NoteEvent | null = null
      for (let k = 0; k * stepTicks < end; k++) {
        let s: Step | undefined
        if (k < steps.length) s = steps[k]
        else if (open) s = k === steps.length ? fill : null
        else s = steps[k % steps.length]
        if (!s) continue
        if (cur) cur.ticks = k * stepTicks - cur.tick
        cur = null
        if (s.cut) continue
        const midi = midiOf(s)
        cur = {
          tick: k * stepTicks,
          ticks: 0,
          note: {
            midi,
            name: midiToName(midi, s.degree ? key.flats : false),
            // a transposed note is spelt from the key, since only its sound moved
            ...(!transpose && { spell: spellOf(s, midi, key) }),
          },
          ...(transpose && { transpose }),
          // a note counted from another (5 of C3) is shown as the note it is, G3
          label: s.of ? spelledName(s, written(s), key) : s.label!,
          instrument: part.name,
          ...(sound && { sound }),
          voice: 0,
          vel: s.accent ? 1 : s.ghost ? 0.3 : 0.7,
          accent: s.accent,
          ghost: s.ghost,
          repeat: !open && k >= steps.length,
          line: part.ln,
        }
        out.push(cur)
      }
      if (cur) cur.ticks = end - cur.tick
      return out
    },
  }
}

// One line of what a pitched instrument plays: notes, or a chart of chords with chords in
// front of it. The word in front is what says a line is a chart, whatever the chart holds.
function pitchedLayer(
  line: Line,
  part: PitchedPart,
  st: State,
  barTicks: number,
  err: Report,
): PitchedClip | ChartClip | null {
  const here = { ...part, ln: line.ln, value: line.parts }
  const text = textOf(line.parts)
  const tokens = tokenize(text)
  if (tokens[0] === "chords") {
    const chart = tokens.slice(1)
    if (bracesIn(line.parts).length) {
      err(line.ln, CHORDS_BLOCK)
      return null
    }
    return chordPattern(here, chart, st, barTicks, err)
  }
  if (tokens[0] !== "notes") {
    // Every instrument line says which type it holds, as a chart does: piano: chords Am F
    if (tokens.length) {
      const key = keyOf(st)!
      const chart = tokens.every(
        (t) => CHORD_MARKS.includes(t) || st.words[t]?.type === "chords" || buildChord(t, key),
      )
      err(
        line.ln,
        `${part.name} takes notes or chords, and says which: ` +
          (chart
            ? `${part.name}: chords ${text}`
            : `${part.name}: notes ${spaceNotes(text) || "F---G---"}`),
      )
      return null
    }
    const voice = noteVoice(line, part, st, err)
    return voice && notePattern(here, voice, st)
  }
  // notes, then what the line plays: the word is dropped and the rest is read as notes
  const [first, ...others] = line.parts
  const bare: Line = {
    ...line,
    parts: [(first as string).replace(/^\s*notes\s*/, ""), ...others],
  }
  const voice = noteVoice(bare, part, st, err)
  return voice && notePattern(here, voice, st)
}

// A pitched instrument's line: guitar: notes E---F# E-E--, or piano: chords Am F|C G. A block
// holds its layers, one a line, which play together: more notes at once, or chords under a
// tune. Each layer repeats until they all line up again.
export function pitchedPattern(
  part: PitchedPart,
  st: State,
  barTicks: number,
  err: Report,
): PitchedClip | ChartClip | null {
  const block = onlyBraces(part.value)
  if (!block) return pitchedLayer({ ln: part.ln, parts: part.value }, part, st, barTicks, err)
  const layers = block.lines.map((line) => {
    if (/^with(\s|\{|$)/.test(textOf(line.parts))) {
      err(line.ln, withInLayers(part.name))
      return null
    }
    if (TRACK_RE.test(headOf(line.parts))) {
      err(
        line.ln,
        `A block after ${part.name}: holds what ${part.name} plays, one layer a line. ${textOf(line.parts)} is an instrument's line, which goes in a pattern`,
      )
      return null
    }
    return pitchedLayer(line, part, st, barTicks, err)
  })
  if (layers.includes(null)) return null
  const all = layers as (PitchedClip | ChartClip)[]
  // A layer ended in ... has no say in the block's length, and has to fit in it.
  const fixed = all.filter((l) => !("open" in l && l.open))
  if (!fixed.length) {
    err(
      block.ln,
      "Every layer here ends in ..., so nothing says how long the block is. One layer needs a length of its own",
    )
    return null
  }
  const ticks = fixed.reduce((a, l) => lcm(a, l.ticks), 1)
  if (ticks > MAX_BARS * barTicks) {
    err(block.ln, `This block's layers only line up again after more than ${MAX_BARS} bars`)
    return null
  }
  for (const l of all) {
    if ("open" in l && l.open && l.ticks > ticks) {
      err(
        block.ln,
        `A layer's notes run ${sayTicks(l.ticks, st, barTicks)} before its ..., and the block is only ${sayTicks(ticks, st, barTicks)} long`,
      )
      return null
    }
  }
  return {
    kind: "pitched",
    ticks,
    expand(total: number, loop: boolean) {
      const end = loop ? total : Math.min(total, ticks)
      // Each layer is a voice of its own, so its notes don't cut another layer's short.
      return all.flatMap((l, voice): (NoteEvent | ChordEvent)[] =>
        l.expand(end, true).map((e) => ("note" in e ? { ...e, voice } : e)),
      )
    },
  }
}
