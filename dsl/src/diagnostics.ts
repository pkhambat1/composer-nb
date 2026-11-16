/* How the engine says a cell is wrong: a message by its code, and the span of the cell it's
   about, the one stretch of code an editor marks for it. The wording of every message is
   in messages.ts. Here are the diagnostics themselves, how a mistake is found in a cell's
   source, and the helpers the readers use to say where a mistake is. */
import type { Span } from "./syntax.ts"
import type { SourceText } from "./source.ts"
import { MESSAGES } from "./messages.ts"

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

// Reports a mistake on a line of the cell, and what in it the mistake is about (see At)
export type Report = ((line: number, msg: string, at: At) => void) & {
  source?: SourceText
  cell?: symbol
}

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

export function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
  }
  return d[a.length][b.length]
}

export const closest = (name: string, names: readonly string[]): [string, number] =>
  names.map((n): [string, number] => [n, editDistance(name, n)]).sort((a, b) => a[1] - b[1])[0]
