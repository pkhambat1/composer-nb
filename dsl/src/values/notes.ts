/* Notes: what a pitched instrument plays, in equal slots within each bar, or fixed steps
   under every. A note is a letter (E, F#4)
   or a degree of the key (b3, 8); interval functions move notes through the scale. - lets it ring
   and _ stops it. Repeats copy words or groups (7*-, 2*(1--- 3---)), and ... fills to the
   end. A block holds layers that sound together, each a voice of its own. */
import {
  buildChord,
  degreeSemitones,
  degreeNumber,
  validDegree,
  isDegreeChord,
  letterStep,
  midiToName,
  pastScale,
  keyOf,
} from "../chords.ts"
import {
  intervalCall,
  intervalSteps,
  moveInScale,
  wrapInterval,
  callSegments,
  type IntervalCall,
  tokenize,
} from "../intervals.ts"
import { misplaced } from "../check.ts"
import { bracesIn, headOf, onlyBraces, textOf, withHead, sourceOf } from "../parts.ts"
import { atCursor, message, reportIn, type Report } from "../diagnostics.ts"
import { SourceText, locatedTokens, tokenSources, repeatTokens } from "../source.ts"
import { type Line, type Piece, type State, barLineProblem } from "../state.ts"
import { barSlotTicks, lcm, MAX_BARS, meterOf, sayTicks, timeLabel } from "../time.ts"
import { FUNCTIONS, NAME_LIKE, TRACK_RE } from "../vocab.ts"
import {
  CHORD_MARKS,
  chordPattern,
  chartRepeat,
  type ChartClip,
  type ChordEvent,
  type Key,
  type Part,
} from "./chart.ts"

// One step of a line of notes: null for -, { cut } for _, or a note. A note by name has
// `name` and `octave`; a degree has `degree` and `acc` (b or #).
// ^ or ~ in front makes it `accent` or `ghost`.
export type NoteStep = {
  cut?: boolean
  name?: string
  octave?: number | null
  degree?: number
  numeric?: boolean
  acc?: string
  label?: string
  accent?: boolean
  ghost?: boolean
  intervals?: IntervalCall[]
}
type Step = NoteStep | null
// A line of notes read, as tokens with its repeats written out, then as steps: whether it
// ends in ..., and what fills the rest when it does
type NoteParts = { tokens: string[]; open: boolean; fill: NoteStep | null }
type Voice = {
  bars: Step[][]
  sources: (SourceText | undefined)[]
  open?: boolean
  fill?: NoteStep | null
}
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
// counts on: degree 3 in D major is F#.
function letterOf(s: NoteStep, key: Key): string {
  if (!s.degree) return s.name![0]
  const step = LETTERS.indexOf(key.root[0]) + letterStep(key, s.degree)
  return LETTERS[((step % 7) + 7) % 7]
}
// A note as its letter, accidental and octave.
function spelledName(s: NoteStep, midi: number, key: Key): string {
  const { letter, alter } = spellOf(s, midi, key)
  return (
    letter +
    (alter > 0 ? "#".repeat(alter) : "b".repeat(-alter)) +
    (Math.floor((midi - alter) / 12) - 1)
  )
}
// A note (F#4) or a signed scale degree (b3, 8, -1), with ^ or ~ in
// front. All consecutive digits belong to one degree; octave movement is written
// with higher degrees or octave(...). Lowercase Roman degrees remain supported.
const NOTE_AT = /([\^~])?(?:([A-G])([#b])?(\d)?|(-?)([#b])?(vii|vi|iv|v|iii|ii|i|[1-9]\d*))/y

// One note at `i` in `run`: a name, degree or interval call, with ^ or ~ in front.
function noteAt(run: string, i: number): { step: NoteStep; end: number } | null {
  const fn = intervalCall(run.slice(i))
  if (fn) {
    if (fn.error) return null
    const call = fn.call!
    const inner = noteSteps(call.body)
    if (inner?.length !== 1 || !inner[0] || inner[0].cut) return null
    return { step: shiftedNote(inner[0], call), end: i + call.end }
  }
  NOTE_AT.lastIndex = i
  const m = NOTE_AT.exec(run)
  if (!m || m[4] === "9" || (m[7] && !validDegree(degreeNumber(m[5] + m[7])))) return null
  const mods = { accent: m[1] === "^", ghost: m[1] === "~" }
  const end = NOTE_AT.lastIndex
  const step: NoteStep = m[2]
    ? {
        name: m[2] + (m[3] || ""),
        octave: m[4] ? Number(m[4]) : null,
        label: m[2] + (m[3] || "") + (m[4] || ""),
      }
    : {
        degree: degreeNumber(m[5] + m[7]),
        numeric: /^\d/.test(m[7]),
        acc: m[6] || "",
        label: m[5] + (m[6] || "") + m[7],
      }
  return { step: { ...step, ...mods }, end }
}

// A run of notes (E---F#, i---biii---) → its steps: one for each note, - or _, however many
// characters a note takes. A step is null for -, { cut } for _, or the note, with whether
// ^ or ~ is in front of it: a note by name ({ name, octave }) or a degree ({ degree, acc,
// numeric }). null when it isn't a run of notes.
function shiftedNote(step: NoteStep, call: IntervalCall): NoteStep {
  return {
    ...step,
    intervals: [...(step.intervals ?? []), call],
    label: wrapInterval({ ...call, prefix: "" }, step.label!),
    accent: call.prefix === "^" || step.accent,
    ghost: call.prefix === "~" || step.ghost,
  }
}

export function noteSteps(run: string): Step[] | null {
  const steps: Step[] = []
  for (let i = 0; i < run.length; ) {
    if ((run[i] === "-" && !negativeStart(run, i)) || run[i] === "_") {
      steps.push(run[i] === "_" ? { cut: true } : null)
      i++
      continue
    }
    const fn = intervalCall(run.slice(i))
    if (fn) {
      if (fn.error) return null
      const call = fn.call!
      const inner = noteSteps(call.body)
      if (!inner) return null
      steps.push(...inner.map((s) => (s && !s.cut ? shiftedNote(s, call) : s)))
      i += call.end
      continue
    }
    const n = noteAt(run, i)
    if (!n) return null
    steps.push(n.step)
    i = n.end
  }
  return steps.length ? steps : null
}

// A leading minus belongs to a number; later dashes in a run remain sustain steps.
// Use a space before another negative note: -1--- -2---. 1---2--- keeps its rhythm.
const negativeStart = (run: string, i: number) => i === 0 && /^-[#b]?\d/.test(run)

// A note's step as it's written: ^C2, b3, octave(1)
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
    if ((run[i] === "-" && !negativeStart(run, i)) || run[i] === "_") {
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

// What to mark when the interval call `text` starts with is written wrong: its name when
// there's no function by that name, the name and ( when its ) is missing, or else the call.
export function callAt(text: string): string {
  const head = /^[\^~]?([a-z][A-Za-z0-9]*)\s*\(/.exec(text)
  if (!head) return text
  if (!FUNCTIONS.includes(head[1])) return head[1]
  let depth = 1
  let end = head[0].length
  for (; end < text.length && depth; end++) {
    if (text[end] === "(") depth++
    else if (text[end] === ")") depth--
  }
  return depth ? head[0] : text.slice(0, end)
}

export const notesTouch = (run: string, spaced: string) => message("note.touch", { run, spaced })

// Whether a token can only be notes drawn on steps: more than one step, with a note among
// them (F---G, E2 G2, i---iii). One letter on its own could be a chord's name, so it isn't
// told here.
export function drawsNotes(tok: string): boolean {
  const steps = noteSteps(tok)
  return (
    !!steps &&
    steps.length > 1 &&
    steps.some((s) => s && !s.cut) &&
    /[A-G_-]/.test(tok) &&
    !/^[A-G][#b]?\d+$/.test(tok)
  )
}

// Notes use the same finite repeat notation as drum steps. A repeat copies note
// attacks as well as holds/rests; 1 7*- is one held note, while 8*1 is eight attacks.
// Names stay symbolic so their degrees resolve in the key where they are played.
export function noteParts(
  value: string,
  st: State,
  err: Report,
  ln: number,
  part: PitchedPart | null,
  depth = 0,
  repeats = true,
): NoteParts | null {
  // Calls can touch a preceding sustain (1---fifth(3)---). Keep the whole word
  // under a repeat count while reading each call's parentheses as one unit.
  const callStarts: number[] = []
  let offset = 0
  for (const segment of callSegments(value)) {
    if (segment.call) callStarts.push(offset)
    offset += segment.text.length
  }
  let at = 0
  let failed = false
  let open = false
  let fill: NoteStep | null = null
  const limit = Math.floor((MAX_BARS * meterOf(st).barTicks) / st.stepTicks)
  // A mistake is marked on `where`, the text of `value` it's about, as it's written
  const fail = (msg: string, where: string, from?: number): null => {
    if (!failed) err(ln, msg, atCursor(err, value, at, where, from))
    failed = true
    return null
  }
  if (depth > 32) return fail(message("interval.nested"), value)
  if (value.includes("'"))
    return fail(message("octave.apostrophe"), /[^\s|]*'[^\s|]*/.exec(value)![0])
  const lengthWord = /\b(?:steps?|beats?|bars?)\b/.exec(value)
  if (lengthWord) return fail(message("note.lengthWord"), lengthWord[0])
  const ws = () => {
    while (at < value.length && /\s/.test(value[at])) at++
  }
  const knownSize = (token: string): number | null => {
    if (token === "|") return 0
    const word = st.words[token]
    if (word?.type === "notes")
      return word.tokens.reduce((n, t) => n + (t === "|" ? 0 : noteSteps(t)!.length), 0)
    const steps = noteSteps(token)
    return steps && !spacedNotes(token) ? steps.length : null
  }
  const size = (tokens: string[], strict = false): number =>
    tokens.reduce((n, t) => {
      const length = knownSize(t)
      if (length === null && strict) {
        const type = st.words[t]?.type ?? st.sections[t]?.type
        fail(
          type
            ? message("name.wrongType", { name: t, type, into: "notes" })
            : notNotes(t, st, part?.name ?? "piano", `piano: chords ${t}`),
          t,
        )
      }
      return n + (length ?? 0)
    }, 0)
  // Read a word, keeping each interval call together. `needs` (the repeat or ... in front of
  // it) is what's missing a word when there isn't one.
  const word = (needs: string): string | null => {
    const start = at
    const fn = intervalCall(value.slice(at))
    if (fn) {
      if (fn.error) return fail(fn.error, callAt(value.slice(at)))
      at += fn.call!.end
      while (at < value.length && /[-_]/.test(value[at])) at++
    } else {
      const nextCall = callStarts.find((start) => start > at) ?? value.length
      const found = /^[^\s(),|*]+/.exec(value.slice(at, nextCall))?.[0]
      if (!found) return fail(message("note.needsWord"), needs)
      at += found.length
      if (found === "rest") return fail(message("note.silence"), found)
    }
    if (at < value.length && /[-_]/.test(value[at - 1]) && !/[\s(),|*]/.test(value[at])) {
      if (!word(needs)) return null
    }
    return value.slice(start, at)
  }
  const expandWord = (token: string, source?: SourceText): string[] | null => {
    const atoms = tokenize(token)
    if (atoms.length > 1) {
      const expanded: string[] = []
      for (const atom of atoms) {
        const more = expandWord(atom, source?.select(atom) ?? source)
        if (!more) return null
        expanded.push(...more)
      }
      return locatedTokens(expanded, source && expanded.map(() => source))
    }
    const fn = intervalCall(token)
    if (!fn) return locatedTokens([token], source && [source])
    if (fn.error) return fail(fn.error, callAt(token))
    const call = fn.call!
    const tail = token.slice(call.end)
    if (!/^[-_]*$/.test(tail))
      return fail(message("note.spaceAfterCall", { call: call.name }), token)
    const bodyFrom = token.indexOf("(") + 1
    const argument = source
      ?.slice(
        bodyFrom,
        bodyFrom +
          token.slice(bodyFrom).length -
          token.slice(bodyFrom).trimStart().length +
          call.body.length,
      )
      .trim()
    const inner = noteParts(call.body, st, reportIn(err, argument), ln, part, depth + 1, false)
    if (!inner) {
      failed = true
      return null
    }
    if (inner.open) return fail(message("note.callOpen", { call: call.name }), "...")
    const out: string[] = []
    for (const t of inner.tokens) {
      const named = st.words[t]
      const type = named?.type ?? st.sections[t]?.type
      if (type && type !== "notes") {
        return fail(message("name.wrongType", { name: t, type, into: "notes" }), t)
      }
      for (const atom of named?.tokens ?? [t]) {
        // A mistake in a name's notes is marked on the name, which is what's written here
        if (atom !== "|" && (!noteSteps(atom) || spacedNotes(atom)))
          return fail(notNotes(atom, st, part?.name ?? "piano", `piano: chords ${atom}`), t)
        out.push(atom === "|" || /^[-_]+$/.test(atom) ? atom : wrapInterval(call, atom))
      }
    }
    if (tail) out.push(tail)
    return locatedTokens(out, source && out.map(() => source))
  }
  const atom = (nesting: number): string[] | null => {
    const start = at
    const counted = /^([^\s(),|*]+)\s*\*/.exec(value.slice(at))
    if (counted) {
      const n = Number(counted[1])
      if (!/^\d+$/.test(counted[1]) || !Number.isSafeInteger(n) || n < 2)
        return fail(message("note.repeatCount"), counted[1])
      at += counted[0].length
      ws()
      let tokens: string[] | null
      if (value[at] === "(") {
        const open = at
        if (nesting >= 32) return fail(message("note.nested"), "(", open)
        at++
        tokens = sequence(nesting + 1)
        if (!tokens) return null
        if (value[at] !== ")") return fail(message("note.repeatUnclosed"), "(", open)
        at++
        if (!tokens.length) return fail(message("note.repeatEmpty"), value.slice(open, at))
      } else {
        const from = at
        const one = word(counted[0])
        tokens = one === null ? null : expandWord(one, err.source?.slice(from, at))
      }
      if (!tokens) return null
      const length = size(tokens, true)
      if (failed) return null
      if (!length || n > limit / length || n * tokens.length > limit * 2)
        return fail(message("note.tooLong", { max: MAX_BARS }), value.slice(start, at))
      return repeatTokens(tokens, n)
    }
    if (value[at] === "(") return fail(message("note.parens"), "(")
    const one = word(value[at])
    return one === null ? null : expandWord(one, err.source?.slice(start, at))
  }
  const sequence = (nesting: number): string[] | null => {
    const tokens: string[] = []
    const sources: SourceText[] = []
    const result = () => locatedTokens(tokens, err.source && sources)
    const begin = at
    let length = 0
    for (;;) {
      ws()
      if (at >= value.length || value[at] === ")") return result()
      if (value[at] === ",") return fail(message("note.commas"), ",")
      if (value[at] === "|") {
        tokens.push("|")
        if (err.source) sources.push(err.source.slice(at, at + 1))
        at++
        continue
      }
      if (value.startsWith("...", at)) {
        if (nesting) return fail(message("fill.insideRepeat"), "...")
        at += 3
        ws()
        const one = word("...")
        if (one === null) return null
        const expanded = expandWord(one)
        const steps = expanded?.flatMap((t) => noteSteps(t) ?? [])
        if (!steps || steps.length !== 1) return fail(message("note.fillOne"), one)
        fill = steps[0]
        open = true
        ws()
        if (at < value.length) return fail(message("note.afterFill"), value.slice(at))
        return result()
      }
      const start = at
      const more = atom(nesting)
      if (!more) return null
      length += size(more)
      if (failed) return null
      if (length > limit || tokens.length + more.length > limit * 2)
        return fail(message("note.tooLong", { max: MAX_BARS }), value.slice(begin, at))
      tokens.push(...more)
      if (err.source)
        sources.push(...(tokenSources(more) ?? more.map(() => err.source!.slice(start, at))))
      // The repeat or word just read, and what touches it
      if (at < value.length && !/[\s),|]/.test(value[at]) && !/[-_]/.test(value[at - 1]))
        return fail(
          message("note.spaceBetween"),
          value.slice(start, at) + /^[^\s|)]*/.exec(value.slice(at))![0],
        )
    }
  }
  const tokens = sequence(0)
  if (!tokens) return null
  if (at < value.length) return fail(message("note.repeatStray"), ")")
  if (repeats && !open && tokens.every((t) => knownSize(t) !== null)) {
    const expanded = tokens.flatMap((t) => st.words[t]?.tokens ?? [t])
    const run = expanded.filter((t) => t !== "|").join(" ")
    const period = st.noteStepTicks && !/^[-_\s]*$/.test(run) && noteRunPeriod(run)
    // Only whole bars repeat by default: shortening a figure within a bar would
    // stretch its notes and change the rhythm. Explicit every keeps step timing.
    const short = st.noteStepTicks
      ? period && spaceNotes(run.replace(/\s/g, "").slice(0, period))
      : chartRepeat(expanded)
    if (short) {
      const head = part ? `${part.name}: notes ` : ""
      return fail(message("note.repeats", { head, value, short }), value)
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
  if (tok.includes("'")) return message("octave.apostrophe")
  if (/^[-_^~A-G#b\d]+$/.test(tok) && /[A-G][#b]?9/.test(tok)) {
    return message("note.octaves", { tok })
  }
  if (/^[-_^~'#b]*\d/.test(tok) && /^[-_^~'#b\d]+$/.test(tok) && !/[A-G]/.test(tok)) {
    return message("note.degrees", { tok })
  }
  if (/^[-_x^~d]+$/.test(tok)) {
    return /[xd]/.test(tok)
      ? message("note.drumSteps", { tok, inst })
      : message("note.accentPlace", { tok })
  }
  if (/^[-_^~a-g#\d']+$/.test(tok) && /[a-g]/.test(tok) && (tok.length === 1 || /[-_]/.test(tok))) {
    return message("note.capitals", { tok, inst })
  }
  if (st.sections[tok]) {
    return misplaced(tok, st.sections[tok].type, {
      line: "pitched",
      part: inst,
      text: "",
      chart: false,
    })!
  }
  if (NAME_LIKE.test(tok) && !isDegreeChord(tok)) {
    return message("note.undefinedAbove", { tok })
  }
  if (buildChord(tok, keyOf(st)!)) {
    return message("note.isChord", { tok, chart })
  }
  if (/[A-G][#b]?(m|M|maj|min|sus|dim|aug|add|\+|°|ø)/.test(tok)) {
    return message("note.chordName", { tok, inst })
  }
  return message("note.notANote", { tok })
}

// One line of notes: its parts (noteParts), which are runs of notes and names of notes in
// a row, with their repeats expanded. Returns { bars, open, fill }, where
// `open` is a line ended in ... and `fill` what fills the rest of it, or null after saying
// what's wrong.
function noteVoice(
  line: Line,
  part: PitchedPart,
  st: State,
  err: Report,
  repeats: boolean,
): Voice | null {
  err = reportIn(err, sourceOf(line.parts))
  const text = textOf(line.parts)
  if (bracesIn(line.parts).length) {
    // What's beside the block is the mistake
    const beside = line.parts.find((p): p is string => typeof p === "string" && !!p.trim())
    err(line.ln, message("note.blockBeside", { part: part.name }), beside ?? "{")
    return null
  }
  const parts = noteParts(text, st, err, line.ln, part, 0, repeats)
  if (!parts) return null
  const steps: Step[] = []
  const bars: Step[][] = []
  const written: (SourceText | undefined)[] = []
  const sources: (SourceText | undefined)[] = []
  let barStart = 0
  let ok = true
  const fail = (msg: string, at: string) => {
    err(line.ln, msg, at)
    ok = false
  }
  const key = keyOf(st)!
  const chart = tokenize(text).every(
    (t) => CHORD_MARKS.includes(t) || st.words[t]?.type === "chords" || buildChord(t, key),
  )
  const finishBar = () => {
    if (steps.length > barStart) {
      bars.push(steps.slice(barStart))
      const parts = written.slice(barStart).filter((s): s is SourceText => !!s)
      sources.push(parts.length ? SourceText.join(parts, " ") : undefined)
    }
    barStart = steps.length
  }
  // A mistake in a name's notes is marked on that name at its use site.
  const barLine = (viaWord?: string) => {
    finishBar()
    const problem = ok && st.noteStepTicks && barLineProblem(steps.length, st)
    if (!problem) return
    fail(
      chart ? message("note.barLineChords", { problem, part: part.name, text }) : problem,
      viaWord ?? "|",
    )
  }
  const add = (tok: string, viaWord?: string) => {
    const at = viaWord ?? tok
    const run = noteSteps(tok)
    const spaced = run && spacedNotes(tok)
    // A degree counts on the key's scale, and whole tone has six notes: no 7 in it
    const past = run?.some((s) => {
      if (!s) return false
      return s.degree !== undefined && !s.numeric && pastScale(key, s.degree)
    })
    if (past)
      fail(message("chord.pastScale", { tok, mode: key.mode, degrees: key.scale.length }), at)
    else if (spaced) fail(notesTouch(tok, spaced), at)
    else if (run) {
      steps.push(...run)
      written.push(...run.map(() => err.source))
    } else if (viaWord) fail(message("note.notANoteIn", { tok, via: viaWord }), at)
    else fail(notNotes(tok, st, part.name, `${part.name}: chords ${text}`), at)
  }
  const outerReport = err
  for (const [index, tok] of parts.tokens.entries()) {
    err = reportIn(outerReport, tokenSources(parts.tokens)?.[index])
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
      if (problem) fail(problem, tok)
      else for (const t of w.tokens) t === "|" ? barLine(tok) : add(t, tok)
    }
  }
  err = outerReport
  if (ok && !steps.length && !parts.fill) {
    fail(message("block.empty", { name: part.name }), text || part.name)
  }
  finishBar()
  return ok ? { bars, sources, open: parts.open, fill: parts.fill } : null
}

// A note's written pitch, shared by playback and print inspection. Transpose is
// applied by the caller, so the written and sounding pitches remain distinguishable.
export function resolveNote(
  s: NoteStep,
  st: State,
  key: Key = keyOf(st)!,
): {
  midi: number
  name: string
  spell: { letter: string; alter: number }
} {
  const octave = st.octave
  const sharp: Record<string, number> = { "#": 1, b: -1 }
  const midi = s.degree
    ? 12 * (octave + 1) + key.tonicSemis + degreeSemitones(s.degree, s.acc, key.scale)
    : 12 * ((s.octave ?? octave) + 1) + NOTE_BASE[s.name![0]] + (sharp[s.name![1]] || 0)
  return (s.intervals ?? []).reduce(
    (p, call) => moveInScale(p.midi, p.name, key, intervalSteps(call, key)),
    { midi, name: spelledName(s, midi, key), spell: spellOf(s, midi, key) },
  )
}

// What one line of notes plays. A note sounds until the next note or _ on its line: -
// means nothing new happens, as it does on a drum's line. A degree is counted from the
// key's root in the current octave. An `open` line (ended in ...) plays its steps once and
// then `fill`, a note held to the end or silence, and has no length of its own.
function notePattern(
  part: PitchedPart,
  { bars, sources, open = false, fill = null }: Voice,
  st: State,
  err: Report,
): PitchedClip | null {
  const barTicks = meterOf(st).barTicks
  const steps: { step: Step; tick: number }[] = []
  let ticks = 0
  const text = textOf(part.value)
  for (const [index, bar] of bars.entries()) {
    const slot = st.noteStepTicks ?? barSlotTicks(barTicks, bar.length)
    if (!slot) {
      err(
        part.ln,
        message("note.splitEvenly", { time: timeLabel(st), slots: bar.length }),
        sources[index]?.span ?? text,
      )
      return null
    }
    for (const step of bar) {
      steps.push({ step, tick: ticks })
      ticks += slot
    }
  }
  if (ticks > MAX_BARS * barTicks) {
    err(part.ln, message("note.tooLong", { max: MAX_BARS }), text)
    return null
  }
  const key = keyOf(st)!
  const sound = st.sounds[part.name]
  const pitch = (s: NoteStep) => resolveNote(s, st, key)
  const transpose = st.transpose
  // The note is marked where it's written on the line, or else the whole line when it isn't
  // (it's in a name, or an interval function moved it)
  for (const step of [...steps.map((s) => s.step), fill]) {
    if (!step || step.cut) continue
    const written = pitch(step)
    if (written.midi + transpose < 0 || written.midi + transpose > 127) {
      err(
        part.ln,
        message("note.outsideMidi", { tok: step.label }),
        text.includes(step.label!) ? step.label! : text,
      )
      return null
    }
  }
  return {
    kind: "pitched",
    open,
    ticks,
    expand(total: number, loop: boolean) {
      const end = loop || open ? total : Math.min(total, ticks)
      const out: NoteEvent[] = []
      let cur: NoteEvent | null = null
      const add = (s: Step, tick: number, repeat: boolean) => {
        if (!s || tick >= end) return
        if (cur) cur.ticks = tick - cur.tick
        cur = null
        if (s.cut) return
        const written = pitch(s)
        const midi = written.midi + transpose
        cur = {
          tick,
          ticks: 0,
          note: {
            midi,
            name: midiToName(midi, s.degree ? key.flats : false),
            // a transposed note is spelt from the key, since only its sound moved
            ...(!transpose && { spell: written.spell }),
          },
          ...(transpose && { transpose }),
          // An interval result is labelled with its resolved pitch.
          label: s.intervals?.length ? written.name : s.label!,
          instrument: part.name,
          ...(sound && { sound }),
          voice: 0,
          vel: s.accent ? 1 : s.ghost ? 0.3 : 0.7,
          accent: s.accent,
          ghost: s.ghost,
          repeat,
          line: part.ln,
        }
        out.push(cur)
      }
      for (let start = 0; start < end; start += ticks) {
        for (const { step, tick } of steps) add(step, start + tick, start > 0)
        if (open || !loop || !ticks) break
      }
      if (open) add(fill, ticks, false)
      // The final sounding note can cross holds and bar boundaries.
      const last = out.at(-1)
      if (last && cur) last.ticks = end - last.tick
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
  repeats = true,
): PitchedClip | ChartClip | null {
  err = reportIn(err, sourceOf(line.parts))
  const here = { ...part, ln: line.ln, value: line.parts }
  const text = textOf(line.parts)
  const tokens = tokenize(text, err.source)
  if (tokens[0] === "chords") {
    const chart = locatedTokens(tokens.slice(1), tokenSources(tokens)?.slice(1))
    if (bracesIn(line.parts).length) {
      err(line.ln, message("decl.chordsBlock"), "{")
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
      // The line's value is missing the word that says which, so the value is marked
      err(
        line.ln,
        message("note.saysWhich", {
          part: part.name,
          chart,
          text,
          notes: spaceNotes(text) || "F---G---",
        }),
        headOf(line.parts).trim() || text,
      )
      return null
    }
    const voice = noteVoice(line, part, st, err, repeats)
    return voice && notePattern(here, voice, st, err)
  }
  // notes, then what the line plays: the word is dropped and the rest is read as notes
  const bare: Line = {
    ...line,
    parts: withHead(line.parts, headOf(line.parts).replace(/^\s*notes\s*/, "")),
  }
  const voice = noteVoice(bare, part, st, err, repeats)
  return voice && notePattern(here, voice, st, err)
}

// A pitched instrument's line: guitar: notes E---F# E-E--, or piano: chords Am F|C G. A block
// holds its layers, one a line, which play together: more notes at once, or chords under a
// tune. Each layer repeats until they all line up again.
export function pitchedPattern(
  part: PitchedPart,
  st: State,
  barTicks: number,
  err: Report,
  repeats = true,
): PitchedClip | ChartClip | null {
  const block = onlyBraces(part.value)
  if (!block)
    return pitchedLayer({ ln: part.ln, parts: part.value }, part, st, barTicks, err, repeats)
  const layers = block.lines.map((line) => {
    if (/^with(\s|\{|$)/.test(textOf(line.parts))) {
      err(line.ln, message("with.inLayers", { name: part.name }), "with")
      return null
    }
    const track = TRACK_RE.exec(headOf(line.parts))
    if (track) {
      err(
        line.ln,
        message("note.layerInstrument", { part: part.name, text: textOf(line.parts) }),
        track[1],
      )
      return null
    }
    return pitchedLayer(line, part, st, barTicks, err, repeats)
  })
  if (layers.includes(null)) return null
  const all = layers as (PitchedClip | ChartClip)[]
  // A layer ended in ... has no say in the block's length, and has to fit in it. A mistake
  // in the block as a whole is marked on its {, and one in a layer on that layer.
  const fixed = all.filter((l) => !("open" in l && l.open))
  if (!fixed.length) {
    err(block.ln, message("block.layersOpen"), "{")
    return null
  }
  const ticks = fixed.reduce((a, l) => lcm(a, l.ticks), 1)
  if (ticks > MAX_BARS * barTicks) {
    err(block.ln, message("fit.layersTooLong", { max: MAX_BARS }), "{")
    return null
  }
  for (const [i, l] of all.entries()) {
    if ("open" in l && l.open && l.ticks > ticks) {
      const layer = block.lines[i]
      err(
        layer.ln,
        message("note.layerRuns", {
          hits: sayTicks(l.ticks, st, barTicks),
          length: sayTicks(ticks, st, barTicks),
        }),
        textOf(layer.parts),
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
