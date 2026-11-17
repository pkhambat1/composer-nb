/* Evaluated musical values for inspection. This path never creates a play, an audio
   event or a timeline. The written value and its resolved musical meaning stay together. */
import {
  buildChord,
  chordParts,
  degreeIndex,
  degreeNumber,
  midiToName,
  pastScale,
  type Voiced,
  keyOf,
} from "./chords.ts"
import { intervalCall, intervalSteps, splitOutside, tokenize, splitBars } from "./intervals.ts"
import { extensionCall } from "./extensions.ts"
import type { State } from "./state.ts"
import { atOffset, message, reportIn, type Report } from "./diagnostics.ts"
import { type SourceText, tokenSources } from "./source.ts"
import { chordSlot, expandChordTokens } from "./values/chart.ts"
import {
  noteParts,
  noteSteps,
  notNotes,
  resolveNote,
  spacedNotes,
  notesTouch,
} from "./values/notes.ts"
import { isStepRun, stepParts } from "./values/steps.ts"

export type PrintedItem = {
  text: string
  kind: "note" | "chord" | "step" | "hold" | "rest" | "bar"
  pitch?: string
  midi?: number
  chord?: string
  tones?: string[]
  bass?: string
  sounding?: string[]
  // Under transpose: the chord's name and bass as they sound
  soundingChord?: string
  soundingBass?: string
}
export type PrintedValue = {
  source: string
  type: "notes" | "chords" | "steps"
  text: string
  items: PrintedItem[]
}
export type PrintOutput = {
  line: number
  source: string
  text: string
  values: PrintedValue[]
  key: string
  mode: string
  octave: number
  transpose: number
}

// Named values retain their type, including inside interval functions. Bare degrees
// inspect as pitches. A caller can request chord interpretation with `chords ...`.
function inferredTypes(value: string, st: State, depth = 0): Set<string> {
  const types = new Set<string>()
  if (depth > 32) return types
  for (const token of tokenize(value)) {
    const named = st.words[token] ?? st.sections[token]
    if (named) {
      types.add(named.type)
      continue
    }
    // extend is unambiguously a chord operation, including an inline degree
    // chart. Its evaluator reports malformed calls and non-chord arguments.
    if (extensionCall(token)) {
      types.add("chords")
      continue
    }
    const fn = intervalCall(token)
    if (fn?.call) {
      for (const type of inferredTypes(fn.call.body, st, depth + 1)) types.add(type)
    } else if (isStepRun(token) && /[x^~d]/.test(token)) types.add("steps")
    else if (!noteSteps(token) && buildChord(token, keyOf(st))) types.add("chords")
  }
  return types
}

// A chord's name moved by `semis`: its root and any slash bass, spelled as pitches are.
function movedLabel(label: string, semis: number): string {
  const move = (name: string) => midiToName(nameToPc(name) + 60 + semis).replace(/-?\d+$/, "")
  return label.replace(/^[A-G][#b]?|(?<=\/)[A-G][#b]?$/g, move)
}
const nameToPc = (name: string) =>
  ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 })[name[0] as "C"]! +
  (name[1] === "#" ? 1 : name[1] === "b" ? -1 : 0)

// Printing evaluates musical values; timing marks belong to playback and notation.
export function printedItems(value: PrintedValue): PrintedItem[] {
  return value.items.filter(
    (item) => item.kind === "note" || item.kind === "chord" || item.kind === "step",
  )
}

function printedChordText(token: string, chord: Voiced, st: State): string {
  const key = keyOf(st)!
  let source = token
  let steps = 0
  let transformed = false
  while (true) {
    const extension = extensionCall(source)?.call
    if (extension) {
      source = extension.body
      transformed = true
      continue
    }
    const interval = intervalCall(source)?.call
    if (!interval) break
    steps += intervalSteps(interval, key)
    source = interval.body
    transformed = true
  }
  if (!transformed) return token
  const [main, bass] = chordParts(source)
  const degree = /^(-?)([#b]?)(vii|vi|iv|v|iii|ii|i|[1-9]\d*)(.*)$/.exec(main)
  if (!degree) return chord.label
  const moved = (parts: RegExpExecArray) => {
    const n = degreeNumber(parts[3]) * (parts[1] ? -1 : 1)
    const index = degreeIndex(n) + steps
    const target = index < 0 ? index : index + 1
    return (target < 0 ? "-" : "") + parts[2] + Math.abs(target)
  }
  const root = moved(degree)
  const bassDegree = bass && /^(-?)([#b]?)(vii|vi|iv|v|iii|ii|i|[1-9]\d*)$/.exec(bass)
  const over = bass
    ? "/" + (bassDegree ? moved(bassDegree) : chord.bassName.replace(/-?\d+$/, ""))
    : ""
  let suffix = chordParts(chord.label)[0].replace(/^[A-G][#b]*/, "")
  if (/^6/.test(suffix)) suffix = "M" + suffix
  else if (/^\d/.test(suffix)) suffix = "dom" + suffix
  // A composed symbol can enumerate the same voiced pitches in another order.
  // Compare pitch multisets without changing either chord's playback ordering.
  const sounding = [...chord.notesMidi].sort((a, b) => a - b)
  for (const text of [root + degree[4] + over, root + over, root + suffix + over]) {
    const candidate = buildChord(text, key, st.octave)
    if (
      candidate &&
      candidate.notesMidi.length === chord.notesMidi.length &&
      [...candidate.notesMidi].sort((a, b) => a - b).every((m, i) => m === sounding[i]) &&
      (!chord.overBass || candidate.bassMidi === chord.bassMidi)
    )
      return text
  }
  return token
}

// One argument of a print, evaluated. A mistake in it is about the argument as written, or
// the one token in it that's wrong.
function inspect(source: string, st: State, ln: number, err: Report): PrintedValue | null {
  const explicit = /^(notes|chords|steps)(?:\s+|$)/.exec(source)
  const value = explicit ? source.slice(explicit[0].length).trim() : source
  const inferred = explicit ? new Set([explicit[1]]) : inferredTypes(value, st)
  if (!value) {
    err(ln, message("print.needsValue"), explicit![1])
    return null
  }
  if (inferred.has("pattern") || inferred.has("block")) {
    err(ln, message("print.notMusical"), source)
    return null
  }
  if (inferred.size > 1) {
    err(ln, message("print.mixedTypes"), source)
    return null
  }
  const type = ([...inferred][0] ?? "notes") as PrintedValue["type"]
  const items: PrintedItem[] = []
  let failed = false
  const valueReport = reportIn(err, err.source?.slice(source.length - value.length))
  const report: Report = (line, msg, at) => {
    failed = true
    valueReport(line, msg, at)
  }
  report.source = valueReport.source
  report.cell = err.cell
  const key = keyOf(st)!
  if (type === "steps") {
    const parts = stepParts(value, st, report, ln, null, false)
    if (!parts) return null
    if (parts.toEnd) {
      report(ln, message("print.finite"), "...")
      return null
    }
    for (const t of parts.tokens)
      for (const word of st.words[t]?.tokens ?? [t])
        for (const text of word)
          items.push({ text, kind: text === "|" ? "bar" : text === "-" ? "rest" : "step" })
  } else if (type === "chords") {
    const written = tokenize(value, report.source)
    const tokens = expandChordTokens(written, st, report, ln)
    if (!tokens) return null
    const bars = splitBars(tokens)
    for (let i = 0; i < bars.length; i++) {
      if (bars[i].length === 1 && bars[i][0] === "%") {
        if (!i) {
          report(ln, message("chord.firstBar"), "%")
          return null
        }
        bars[i] = bars[i - 1]
      }
    }
    const entries = bars.flatMap((bar, i) => [
      ...(i ? [{ token: "|", source: undefined }] : []),
      ...bar.map((token, j) => ({ token, source: tokenSources(bar)?.[j] })),
    ])
    for (const { token, source } of entries) {
      const tokenReport = reportIn(report, source)
      if (["|", "-", "_"].includes(token)) {
        items.push({ text: token, kind: token === "-" ? "hold" : token === "_" ? "rest" : "bar" })
        continue
      }
      const chord = chordSlot(
        token,
        { name: "print", ln },
        { ...st, transpose: 0 },
        key,
        tokenReport,
      )?.chord
      if (!chord) continue
      if (
        [chord.bassMidi, ...chord.notesMidi].some(
          (n) => n + st.transpose < 0 || n + st.transpose > 127,
        )
      ) {
        tokenReport(ln, message("note.outsideMidiPrinted", { tok: token }), source?.span ?? token)
        continue
      }
      items.push({
        text: printedChordText(token, chord, st),
        kind: "chord",
        chord: chord.label,
        tones: chord.noteNames,
        ...(chord.overBass ? { bass: chord.bassName } : {}),
        ...(st.transpose
          ? {
              sounding: chord.notesMidi.map((n) => midiToName(n + st.transpose)),
              soundingChord: movedLabel(chord.label, st.transpose),
              ...(chord.overBass
                ? { soundingBass: midiToName(chord.bassMidi + st.transpose) }
                : {}),
            }
          : {}),
      })
    }
  } else {
    const parts = noteParts(value, st, report, ln, null, 0, false)
    if (!parts) return null
    if (parts.open) {
      report(ln, message("print.finite"), "...")
      return null
    }
    // Each note, with how it's written in the cell: itself, or the name it comes from
    const tokens: { token: string; written: string; source?: SourceText }[] = []
    for (const [i, token] of parts.tokens.entries()) {
      const source = tokenSources(parts.tokens)?.[i]
      const named = st.words[token]
      if (named && named.type !== "notes")
        reportIn(report, source)(
          ln,
          message("name.wrongType", { name: token, type: named.type, into: "notes" }),
          token,
        )
      else
        for (const t of named?.tokens ?? [token]) tokens.push({ token: t, written: token, source })
    }
    for (const { token, written, source } of tokens) {
      const tokenReport = reportIn(report, source)
      if (token === "|") {
        items.push({ text: token, kind: "bar" })
        continue
      }
      const steps = noteSteps(token)
      const spaced = spacedNotes(token)
      if (!steps || spaced) {
        tokenReport(
          ln,
          spaced
            ? notesTouch(token, spaced)
            : notNotes(token, st, "piano", `print(chords ${value})`),
          written,
        )
        continue
      }
      for (const step of steps) {
        if (!step || step.cut) {
          items.push({ text: step ? "_" : "-", kind: step ? "rest" : "hold" })
          continue
        }
        const root = step
        if (root.degree !== undefined && !root.numeric && pastScale(key, root.degree)) {
          tokenReport(
            ln,
            message("scale.pastOctave", { mode: key.mode, degrees: key.scale.length }),
            written,
          )
          continue
        }
        const pitch = resolveNote(step, st, key)
        if (pitch.midi + st.transpose < 0 || pitch.midi + st.transpose > 127) {
          tokenReport(ln, message("note.outsideMidiPrinted", { tok: step.label }), written)
          continue
        }
        let text = step.label!
        if (step.degree) {
          const index =
            degreeIndex(step.degree) +
            (step.intervals ?? []).reduce((n, c) => n + intervalSteps(c, key), 0)
          const degree = index < 0 ? index : index + 1
          text = (degree < 0 ? "-" : "") + (step.acc ?? "") + Math.abs(degree)
        } else if (step.intervals?.length) text = pitch.name
        items.push({
          text: (step.accent ? "^" : step.ghost ? "~" : "") + text,
          kind: "note",
          pitch: pitch.name,
          midi: pitch.midi,
          ...(st.transpose ? { sounding: [midiToName(pitch.midi + st.transpose)] } : {}),
        })
      }
    }
  }
  if (!items.length && !failed) report(ln, message("print.needsMusical"), source)
  if (failed) return null
  const printed = { source, type, text: "", items }
  printed.text =
    printedItems(printed)
      .map((i) => i.text)
      .join(" ") || "[]"
  return printed
}

// `text` is the part after print. Each comma at the call's own level starts another
// value; commas in interval functions belong to those functions. A mistake in how the
// call is written is about the part of it that's wrong, or print when it has no
// parentheses.
export function printValue(text: string, st: State, ln: number, err: Report): PrintOutput | null {
  text = text.trim()
  err = reportIn(err, err.source?.select(text))
  if (!text.startsWith("(")) {
    err(ln, message("print.parens"), "print")
    return null
  }
  let depth = 1
  let end = 1
  for (; end < text.length && depth; end++) {
    if (text[end] === "(") depth++
    else if (text[end] === ")") depth--
  }
  if (depth) {
    err(ln, message("print.unclosed"), atOffset(err, 0, 1, "("))
    return null
  }
  if (text.slice(end).trim()) {
    err(ln, message("print.trailing"), err.source?.slice(end).trim().span ?? text.slice(end))
    return null
  }
  const written = splitOutside(text.slice(1, end - 1), ",")
  const args = written.map((s) => s.trim())
  const empty = args.findIndex((a) => !a)
  if (empty >= 0) {
    // The empty argument with what's on either side of it: a comma, or a parenthesis
    const from = written.slice(0, empty).reduce((n, a) => n + a.length + 1, 0)
    const to = from + written[empty].length + 2
    err(ln, message("print.emptyArgument"), atOffset(err, from, to, text.slice(from, to)))
    return null
  }
  let offset = 1
  const values = args.map((a, i) => {
    const source = err.source?.slice(offset, offset + written[i].length).trim()
    offset += written[i].length + 1
    return inspect(a, st, ln, reportIn(err, source))
  })
  if (values.some((v) => v === null)) return null
  const known = values as PrintedValue[]
  return {
    line: ln,
    source: `print${text}`,
    text: known.map((v) => v.text).join(", "),
    values: known,
    key: st.key,
    mode: st.mode,
    octave: st.octave,
    transpose: st.transpose,
  }
}

const PRINTABLE = ["notes", "chords", "steps"]

// Whether a line of its own is a value to evaluate, as in a notebook: a value that says
// its type (chords 1 4 5), or names and interval functions of names (melody,
// fifth(harmony)). extend always yields chords, so its inline form is also a value.
// A literal without its type isn't one: 1 2 3 could be notes or chords.
export function isBareValue(text: string, st: State, depth = 0): boolean {
  text = text.trim()
  if (!depth && /^(notes|chords|steps)\s+\S/.test(text)) {
    // notes riff F---: a new name and then its value is a declaration missing its =
    const [, type, first, rest] = /^(\w+)\s+(\S+)\s*([\s\S]*)$/.exec(text)!
    const reads =
      type === "notes"
        ? !!noteSteps(first)
        : type === "chords"
          ? !!buildChord(first, keyOf(st))
          : isStepRun(first)
    return !(rest && /^[A-Za-z][A-Za-z0-9]*$/.test(first) && !st.words[first] && !reads)
  }
  const tokens = tokenize(text)
  if (!tokens.length || depth > 32) return false
  return tokens.every((token) => {
    const named = st.words[token]
    if (named) return PRINTABLE.includes(named.type)
    if (extensionCall(token)) return true
    const fn = intervalCall(token)
    return !!fn?.call && isBareValue(fn.call.body, st, depth + 1)
  })
}

// A value on a line of its own, evaluated the way print evaluates one argument. The
// cell shows it only when it is the cell's last statement.
export function bareValue(text: string, st: State, ln: number, err: Report): PrintOutput | null {
  text = text.trim()
  const value = inspect(text, st, ln, err)
  return (
    value && {
      line: ln,
      source: text,
      text: value.text,
      values: [value],
      key: st.key,
      mode: st.mode,
      octave: st.octave,
      transpose: st.transpose,
    }
  )
}

export function printedMeaning(item: PrintedItem): string {
  const base = item.chord
    ? `${item.chord} (${item.tones!.join(" ")}${item.bass ? `; bass ${item.bass}` : ""})`
    : (item.pitch ??
      (item.kind === "hold" ? "sustain" : item.kind === "rest" ? "silence" : item.text))
  return base + (item.sounding ? ` → sounds ${item.sounding.join(" ")}` : "")
}

/* How a print is laid out, shared by every front end so they all show the same thing.
   A print is one row per type: the type, then its values in order. A value that stands
   for pitches carries them in parentheses straight after it: 1(C3), 6m(Am(A3 C4 E4)). */
export type PrintPart = {
  kind: "note" | "chord" | "steps" | "quiet"
  text: string
  note?: string // what goes in the parentheses
  title?: string
  comma?: boolean // the last value of an argument, with another argument after it
}
export type PrintRow = { line: number; type: PrintedValue["type"]; parts: PrintPart[] }

// The parentheses hold what sounds: under transpose that is the moved pitch, not the
// written one.
function printPart(item: PrintedItem): PrintPart {
  if (item.chord) {
    const chord = item.soundingChord ?? item.chord
    const bass = item.soundingBass ?? item.bass
    const tones = (item.sounding ?? item.tones!).join(" ") + (bass ? `/${bass}` : "")
    // A chord written as a degree resolves twice, to its name and then to its tones:
    // 1(C(C3 E3 G3)). One written by name resolves once: C(C3 E3 G3). A chord over a
    // bass ends with it: C/E(C3 E3 G3/E2).
    return {
      kind: "chord",
      text: item.text,
      note: chord === item.text ? tones : `${chord}(${tones})`,
    }
  }
  if (!item.pitch) return { kind: "quiet", text: item.text, title: printedMeaning(item) }
  const pitch = item.sounding?.[0] ?? item.pitch
  return { kind: "note", text: item.text, ...(pitch === item.text ? {} : { note: pitch }) }
}

// Arguments of one type that follow each other share a row, with a comma between them:
// print(1, 2, 3) is one row of notes. A change of type starts the next row.
export function printLayout(prints: PrintOutput[]): PrintRow[] {
  const rows: PrintRow[] = []
  for (const p of prints) {
    let row: PrintRow | undefined
    for (const value of p.values) {
      const items = printedItems(value)
      const parts: PrintPart[] = !items.length
        ? [{ kind: "quiet", text: "[]" }]
        : value.type === "steps"
          ? [{ kind: "steps", text: items.map((i) => i.text).join("") }]
          : items.map(printPart)
      if (row?.type === value.type) {
        row.parts[row.parts.length - 1].comma = true
        row.parts.push(...parts)
      } else rows.push((row = { line: p.line, type: value.type, parts }))
    }
  }
  return rows
}

export const printPartText = (part: PrintPart): string =>
  part.text + (part.note ? `(${part.note})` : "") + (part.comma ? "," : "")

// A row as one line of text, for clients that only show text.
export const printRowText = (row: PrintRow): string =>
  `${row.type} ${row.parts.map(printPartText).join(" ")}`
