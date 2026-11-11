/* Evaluated musical values for inspection. This path never creates a play, an audio
   event or a timeline. The written value and its resolved musical meaning stay together. */
import { buildChord, chordParts, degreeIndex, degreeNumber, midiToName, pastScale, pastScaleMessage, type Voiced } from "./chords.ts"
import { intervalCall, intervalSteps, splitOutside } from "./intervals.ts"
import { keyOf } from "./settings.ts"
import type { State } from "./state.ts"
import type { Report } from "./time.ts"
import { chordSlot, expandChordTokens } from "./values/chart.ts"
import {
  noteParts,
  noteSteps,
  notNotes,
  resolveNote,
  spacedNotes,
  notesTouch,
} from "./values/notes.ts"
import { isStepRun, splitBars, stepParts, tokenize } from "./values/steps.ts"

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
  return value.items.filter((item) =>
    item.kind === "note" || item.kind === "chord" || item.kind === "step",
  )
}

function printedChordText(token: string, chord: Voiced, st: State): string {
  const key = keyOf(st)!
  let source = token
  let steps = 0
  let call = intervalCall(source)?.call
  if (!call) return token
  while (call) {
    steps += intervalSteps(call, key)
    source = call.body
    call = intervalCall(source)?.call
  }
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
  const over = bass ? "/" + (bassDegree ? moved(bassDegree) : chord.bassName.replace(/-?\d+$/, "")) : ""
  let suffix = chordParts(chord.label)[0].replace(/^[A-G][#b]*/, "")
  if (/^6/.test(suffix)) suffix = "M" + suffix
  else if (/^\d/.test(suffix)) suffix = "dom" + suffix
  for (const text of [root + degree[4] + over, root + over, root + suffix + over]) {
    const candidate = buildChord(text, key, st.octave)
    if (candidate && candidate.notesMidi.length === chord.notesMidi.length &&
      candidate.notesMidi.every((m, i) => m === chord.notesMidi[i]) &&
      (!chord.overBass || candidate.bassMidi === chord.bassMidi)) return text
  }
  return token
}

function inspect(source: string, st: State, ln: number, err: Report): PrintedValue | null {
  const explicit = /^(notes|chords|steps)(?:\s+|$)/.exec(source)
  const value = explicit ? source.slice(explicit[0].length).trim() : source
  const inferred = explicit ? new Set([explicit[1]]) : inferredTypes(value, st)
  if (!value) {
    err(ln, "print needs a value after its type")
    return null
  }
  if (inferred.has("pattern") || inferred.has("block")) {
    err(ln, "print inspects notes, chords and steps; give it a musical value from the block")
    return null
  }
  if (inferred.size > 1) {
    err(
      ln,
      "These values have different types. Give print separate arguments: print(melody, harmony)",
    )
    return null
  }
  const type = ([...inferred][0] ?? "notes") as PrintedValue["type"]
  const items: PrintedItem[] = []
  let failed = false
  const report: Report = (line, msg) => {
    failed = true
    err(line, msg)
  }
  const key = keyOf(st)!
  if (type === "steps") {
    const parts = stepParts(value, st, report, ln, null, false)
    if (!parts) return null
    if (parts.toEnd) {
      report(ln, "print needs a finite value; ... needs a containing block")
      return null
    }
    for (const t of parts.tokens)
      for (const word of st.words[t]?.tokens ?? [t])
        for (const text of word)
          items.push({ text, kind: text === "|" ? "bar" : text === "-" ? "rest" : "step" })
  } else if (type === "chords") {
    const tokens = expandChordTokens(tokenize(value), st, report, ln)
    if (!tokens) return null
    const bars = splitBars(tokens)
    for (let i = 0; i < bars.length; i++) {
      if (bars[i].length === 1 && bars[i][0] === "%") {
        if (!i) {
          report(ln, "% repeats the bar before it, but this is the first bar")
          return null
        }
        bars[i] = [...bars[i - 1]]
      }
    }
    for (const token of bars.flatMap((bar, i) => i ? ["|", ...bar] : bar)) {
      if (["|", "-", "_"].includes(token)) {
        items.push({ text: token, kind: token === "-" ? "hold" : token === "_" ? "rest" : "bar" })
        continue
      }
      const chord = chordSlot(
        token,
        { name: "print", ln },
        { ...st, transpose: 0 },
        key,
        report,
      )?.chord
      if (!chord) continue
      if (
        [chord.bassMidi, ...chord.notesMidi].some(
          (n) => n + st.transpose < 0 || n + st.transpose > 127,
        )
      ) {
        report(ln, `"${token}" goes outside playable MIDI notes 0 to 127`)
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
      report(ln, "print needs a finite value; ... needs a containing block")
      return null
    }
    const tokens: string[] = []
    for (const token of parts.tokens) {
      const named = st.words[token]
      if (named && named.type !== "notes")
        report(ln, `${token} is ${named.type}, so it can't go in notes`)
      else tokens.push(...(named?.tokens ?? [token]))
    }
    for (const token of tokens) {
      if (token === "|") {
        items.push({ text: token, kind: "bar" })
        continue
      }
      const steps = noteSteps(token)
      const spaced = spacedNotes(token)
      if (!steps || spaced) {
        report(
          ln,
          spaced
            ? notesTouch(token, spaced)
            : notNotes(token, st, "piano", `print(chords ${value})`),
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
          report(ln, pastScaleMessage(key))
          continue
        }
        const pitch = resolveNote(step, st, key)
        if (pitch.midi + st.transpose < 0 || pitch.midi + st.transpose > 127) {
          report(ln, `"${step.label}" goes outside playable MIDI notes 0 to 127`)
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
  if (!items.length && !failed) report(ln, "print needs a musical value")
  if (failed) return null
  const printed = { source, type, text: "", items }
  printed.text = printedItems(printed).map((i) => i.text).join(" ") || "[]"
  return printed
}

// `text` is the part after print. Each comma at the call's own level starts another
// value; commas in interval functions belong to those functions.
export function printValue(text: string, st: State, ln: number, err: Report): PrintOutput | null {
  text = text.trim()
  if (!text.startsWith("(")) {
    err(ln, "print takes parentheses: print(1, 2, 3)")
    return null
  }
  let depth = 1
  let end = 1
  for (; end < text.length && depth; end++) {
    if (text[end] === "(") depth++
    else if (text[end] === ")") depth--
  }
  if (depth) {
    err(ln, "print(...) is missing its closing )")
    return null
  }
  if (text.slice(end).trim()) {
    err(ln, "Nothing follows print(...); put the next statement on its own line")
    return null
  }
  const args = splitOutside(text.slice(1, end - 1), ",").map((s) => s.trim())
  if (args.some((a) => !a)) {
    err(ln, "print needs a value for each argument: print(1, 2, 3)")
    return null
  }
  const values = args.map((a) => inspect(a, st, ln, err))
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
// fifth(harmony)). A literal without its type isn't one: 1 2 3 could be notes or chords.
export function isBareValue(text: string, st: State, depth = 0): boolean {
  text = text.trim()
  if (!depth && /^(notes|chords|steps)\s+\S/.test(text)) {
    // notes riff F---: a new name and then its value is a declaration missing its =
    const [, type, first, rest] = /^(\w+)\s+(\S+)\s*(.*)$/.exec(text)!
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
      const parts: PrintPart[] =
        !items.length
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
