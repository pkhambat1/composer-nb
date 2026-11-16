/* What the engine says when a cell is wrong, by code. Each message is written here once,
   with what it needs to say passed in, so the wording of a whole area can be read and
   changed in one place, and tsc checks that a code exists and gets what it needs.
   Messages come out as diagnostics: the message and the span of the cell it's about, the
   one stretch of code an editor marks for it. Moving here so far: settings, defining a
   name twice, and time fitting. The rest of the engine's messages are still written where
   they're reported. */
import type { Span } from "./syntax.ts"
import type { Report } from "./time.ts"
import type { SourceText } from "./source.ts"
import { KITS, MODES, PITCHED, SETTINGS, SETTING_EXAMPLE, SOUNDS } from "./vocab.ts"

// set, or with in a with's header: how the setting was written, so the fix is written so
type Verb = "set" | "with"
// After a with's settings comes its block, so its examples show one
const tail = (verb: Verb) => (verb === "with" ? " { ... }" : "")

export const MESSAGES = {
  // A setting's name and value
  "set.empty": () => "set takes a setting and its value: set tempo 90",
  "set.needsValue": ({ verb, name }: { verb: Verb; name: (typeof SETTINGS)[number] }) =>
    `${verb} ${name} needs a value after it, e.g. ${verb} ${name} ${SETTING_EXAMPLE[name]}${tail(verb)}`,
  "set.needsSound": ({ verb, name }: { verb: Verb; name: keyof typeof SOUNDS }) =>
    `${verb} ${name} needs a sound after it: ${SOUNDS[name]!.join(" or ")}`,
  "set.oneSound": ({ name }: { name: string }) => {
    const choice = Object.entries(SOUNDS).map(([i, s]) => `${i} (${s.join(", ")})`)
    return `${name} has one sound. Instruments with more: ${choice.join(", ")}`
  },
  "set.unknownNear": ({ raw, verb, best }: { raw: string; verb: Verb; best: string }) =>
    `"${raw}" isn't a setting. Did you mean ${verb} ${best}?`,
  "set.unknown": ({ raw, verb }: { raw: string; verb: Verb }) =>
    `"${raw}" isn't a setting. Settings: ${SETTINGS.join(", ")}, and an instrument's sound: ${verb} guitar.electric muted${tail(verb)}`,

  // Each setting's values
  "time.division": ({
    verb,
    value,
    n,
    count,
    unit,
  }: {
    verb: Verb
    value: string
    n: number
    count: string
    unit: string
  }) =>
    `/ is division, so ${value} is the number ${+n.toFixed(4)}, not a time. Write ${verb} time ${count} over ${unit}`,
  "time.shape": ({ verb }: { verb: Verb }) =>
    `time is how many notes over which note: ${verb} time 7 over 8 is seven eighth notes in a bar`,
  "time.count": () =>
    "The first number of time is how many notes are in a bar, a whole number like 7 or 3+4",
  "time.unit": () => "The second number of time is the note being counted: 1, 2, 4, 8 or 16",
  "time.tooLong": () => "A bar can be up to 8 whole notes long",
  "tempo.range": () => "tempo is quarter notes per minute, between 20 and 400",
  "swing.onOff": ({ verb }: { verb: Verb }) =>
    `swing is on or off: ${verb} swing on plays the off-beat eighths late, as a triplet feel`,
  "key.withMode": ({ verb, root, mode }: { verb: Verb; root: string; mode: string }) =>
    verb === "with"
      ? `A key is a note: with key ${root}, mode ${mode} { ... }`
      : `A key is a note: set key ${root}, then set mode ${mode}`,
  "key.notAMode": ({ verb, root }: { verb: Verb; root: string }) =>
    `A key is a note: ${verb} key ${root}. Its mode is a setting of its own, one of ${MODES.join(", ")}`,
  "key.notANote": ({ verb }: { verb: Verb }) =>
    verb === "with"
      ? "A key is a note, A to G with # or b after it: with key E { ... }"
      : "A key is a note, A to G with # or b after it: set key E, set key Bb",
  "mode.camelCase": ({ verb, mode }: { verb: Verb; mode: string }) =>
    `Modes are camelCase: ${verb} mode ${mode}`,
  "mode.unknown": () => `mode is one of: ${MODES.join(", ")}`,
  "transpose.range": ({ verb }: { verb: Verb }) =>
    `transpose is a number of semitones from -12 to 12: ${verb} transpose 2 sounds a whole step up`,
  "octave.range": () => "octave is a number from 1 to 6",
  "kit.unknown": () => `kit is one of: ${KITS.join(", ")}`,
  "sound.unknown": ({ name }: { name: keyof typeof SOUNDS }) =>
    `${name}'s sound is one of: ${SOUNDS[name]!.join(", ")}`,
  "with.inLayers": ({ name }: { name: string }) =>
    `A with goes around ${name}'s line, not among its layers: with ${(PITCHED as readonly string[]).includes(name) ? "octave 5" : "kit synth"} { ${name}: { ... } }`,

  // Names
  "name.defined": ({ name, line }: { name: string; line: number }) =>
    `${name} is already defined on line ${line}. A name is defined once, so pick another name`,

  // What repeats has to fit what it's in a whole number of times
  "fit.whole": ({
    what,
    length,
    total,
    hint,
  }: {
    what: string
    length: string
    total: string
    hint: string
  }) => `${what} is ${length} long, which doesn't fit ${total} a whole number of times. ${hint}`,
  "fit.ownTempo": ({ what, total }: { what: string; total: string }) =>
    `${what} sets its own tempo, and doesn't fit ${total} a whole number of times`,
  "fit.hint": ({ many, when }: { many: boolean; when: string }) =>
    many ? `The things repeating here line up ${when}` : `It lines up ${when}`,

  "chord.unknown": ({ chord }: { chord: string }) => `"${chord}" isn't a chord I know`,
} as const

export type Code = keyof typeof MESSAGES

// The message for `code`, said with `args`
export function message<C extends Code>(
  code: C,
  ...args: Parameters<(typeof MESSAGES)[C]>
): string {
  return (MESSAGES[code] as (...a: unknown[]) => string)(...args)
}

// A mistake in a cell: what's wrong, and the span it's about. Each mistake a cell reports
// has one span, and no two of them overlap, so an editor marks code as wrong exactly where
// a diagnostic says so, and each mark has one message.
export type Diagnostic = Span & { msg: string }

// Where a reader says a mistake is: the text it's about, exactly as written in the cell on
// the line it reports (a whole token: the setting's value, the name that isn't defined, the
// step that isn't one), or a span it already has. What's missing is said where it's
// missing from: set tempo with no value is about tempo.
export type At = string | Span

// A reader reports relative to the text it actually received. The source map survives
// whitespace changes and nested readers; an explicit span always keeps its identity.
export function reportIn(report: Report, source: SourceText | null | undefined): Report {
  if (!source?.text) return report
  if (source.owner && report.cell && source.owner !== report.cell) {
    const inherited: Report = (line, msg, at) => report(line, msg, report.source?.span ?? at)
    inherited.source = report.source
    inherited.cell = report.cell
    return inherited
  }
  const scoped: Report = (line, msg, at) => {
    const selected = typeof at === "string" ? source.select(at, true) : null
    report(line, msg, selected?.span ?? at)
  }
  scoped.source = source
  scoped.cell = report.cell
  return scoped
}

// A value reader already has a character cursor. Use it, including when another identical
// token was valid earlier in the expression.
export function atOffset(report: Report, from: number, to: number, otherwise: string): At {
  const source = report.source?.slice(from, to)
  return source?.text ? source.span : otherwise
}

// The scanner can report the token at its cursor or the one it just consumed. A known
// opening delimiter supplies `from` explicitly when it is no longer at that cursor.
export function atCursor(
  report: Report,
  text: string,
  cursor: number,
  word: string,
  from?: number,
): At {
  const start =
    from ??
    (text.startsWith(word, cursor)
      ? cursor
      : cursor >= word.length && text.slice(cursor - word.length, cursor) === word
        ? cursor - word.length
        : -1)
  return start >= 0 ? atOffset(report, start, start + word.length, word) : word
}

// Mistakes whose text couldn't be found where they were reported, so they were marked on
// their whole line instead. Bounded so incomplete edits cannot accumulate indefinitely;
// the regression corpus checks that none of its diagnostics needs this fallback.
export const unlocated: { line: number; at: string; msg: string }[] = []

const WORD = /[A-Za-z0-9_]/
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// Finds what a mistake is about in a cell's source. `line` is the line it was reported on;
// `within`, when it holds that line, is the statement being read, so a word written twice
// on a line is found in the statement it belongs to. Text that runs over lines may carry on
// past the line, to the statement's end.
export function locator(src: string) {
  const starts = [0]
  for (let i = 0; i < src.length; i++) if (src[i] === "\n") starts.push(i + 1)
  const lineEnd = (line: number) => (line < starts.length ? starts[line] - 1 : src.length)
  const offset = (line: number, col: number) => starts[line - 1] + col
  const position = (at: number) => {
    let line = 1
    while (line < starts.length && starts[line] <= at) line++
    return { line, col: at - starts[line - 1] }
  }
  const spanOf = (from: number, to: number): Span => {
    const a = position(from)
    const b = position(to)
    return { line: a.line, col: a.col, endLine: b.line, endCol: b.col }
  }
  // The code on a line: without its comment or the space around it
  const codeOn = (line: number): Span => {
    const text = src.slice(starts[line - 1], lineEnd(line)).replace(/\/\/.*$/, "")
    const col = text.length - text.trimStart().length
    const end = Math.max(text.trimEnd().length, col + 1)
    return { line, col, endLine: line, endCol: end }
  }

  return (line: number, msg: string, at: At, within: Span | null): Span => {
    if (typeof at === "object" && at) return at
    line = Math.min(Math.max(line, 1), starts.length)
    let from = offset(line, 0)
    let to = lineEnd(line)
    if (within && within.line <= line && line <= within.endLine) {
      if (within.line === line) from = offset(line, within.col)
      to = Math.max(to, offset(within.endLine, within.endCol))
    }
    const text = typeof at === "string" ? at.trim() : ""
    if (text) {
      const re = new RegExp(text.split(/\s+/).map(escape).join("\\s+"), "g")
      re.lastIndex = from
      let first: [number, number] | null = null
      for (let m = re.exec(src); m && m.index <= lineEnd(line); m = re.exec(src)) {
        const end = m.index + m[0].length
        if (end > to) break
        // A whole word, where the text starts or ends with one: tempo, not the tempo in tempos
        const whole =
          !(WORD.test(text[0]) && WORD.test(src[m.index - 1] ?? "")) &&
          !(WORD.test(text[text.length - 1]) && WORD.test(src[end] ?? ""))
        if (whole) return spanOf(m.index, end)
        first ??= [m.index, end]
        re.lastIndex = m.index + 1
      }
      if (first) return spanOf(...first)
    }
    if (unlocated.length < 100) unlocated.push({ line, at: String(at), msg })
    return codeOn(line)
  }
}

// Whether two spans share any of the cell
export const overlaps = (a: Span, b: Span) =>
  (a.line < b.endLine || (a.line === b.endLine && a.col < b.endCol)) &&
  (b.line < a.endLine || (b.line === a.endLine && b.col < a.endCol))
