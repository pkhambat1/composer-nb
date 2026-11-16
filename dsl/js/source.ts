/* Text passed between the language's readers, with the original position of every
   character. Trimming, joining lines and expanding a name must not move an error to
   another occurrence of the same word. Offsets here are UTF-16, like Monaco's columns. */
import type { Span } from "./syntax.ts"

export class SourceText {
  readonly text: string
  readonly positions: readonly Span[]
  readonly owner?: symbol
  constructor(text: string, positions: readonly Span[], owner?: symbol) {
    this.text = text
    this.positions = positions
    this.owner = owner
  }

  static from(text: string, start = { line: 1, col: 0 }, owner?: symbol): SourceText {
    let { line, col } = start
    const positions: Span[] = []
    for (let i = 0; i < text.length; i++) {
      const from = { line, col }
      if (text[i] === "\n") {
        line++
        col = 0
      } else col++
      positions.push({ ...from, endLine: line, endCol: col })
    }
    return new SourceText(text, positions, owner)
  }

  static join(parts: SourceText[], separator = ""): SourceText {
    let text = ""
    const positions: Span[] = []
    for (const part of parts) {
      if (!part.text) continue
      if (text && separator) {
        text += separator
        positions.push(...Array.from({ length: separator.length }, () => part.span))
      }
      text += part.text
      positions.push(...part.positions)
    }
    return new SourceText(text, positions, parts.find((p) => p.owner)?.owner)
  }

  static writtenAs(text: string, span: Span, owner?: symbol): SourceText {
    return new SourceText(
      text,
      Array.from({ length: text.length }, () => span),
      owner,
    )
  }

  static block(span: Span, owner?: symbol): SourceText {
    const source = SourceText.writtenAs("{ ... }", span, owner)
    return new SourceText(
      source.text,
      source.positions.map((p, i) =>
        i === 0
          ? { ...p, endLine: p.line, endCol: p.col + 1 }
          : i === 6
            ? { ...p, line: p.endLine, col: Math.max(0, p.endCol - 1) }
            : p,
      ),
      owner,
    )
  }

  get span(): Span {
    const first = this.positions[0]
    const last = this.positions[this.positions.length - 1]
    if (!first || !last) throw new Error("An empty source has no span")
    return { line: first.line, col: first.col, endLine: last.endLine, endCol: last.endCol }
  }

  slice(from: number, to = this.text.length): SourceText {
    return new SourceText(this.text.slice(from, to), this.positions.slice(from, to), this.owner)
  }

  trim(): SourceText {
    const from = this.text.length - this.text.trimStart().length
    return this.slice(from, this.text.trimEnd().length)
  }

  // Reader text differs from written text only in layout. Keep each remaining character's
  // position when indentation or a continued bar line is removed.
  tidy(layout = false): SourceText {
    const rows: SourceText[] = []
    let at = 0
    for (const line of this.text.split("\n")) {
      const row = this.slice(at, at + line.length).trim()
      at += line.length + 1
      let above = rows.length - 1
      while (above >= 0 && !rows[above].text) above--
      if (row.text.startsWith("|") && above >= 0) {
        const previous = rows[above]
        const end = previous.text.replace(/\|\s*$/, "").length
        rows[above] = SourceText.join([previous.slice(0, end), row], " ")
      } else rows.push(row)
    }
    return SourceText.join(
      rows.filter((r) => r.text),
      layout ? " " : "\n",
    ).trim()
  }

  // For a named syntactic part with no local cursor (a setting, for example), only use a
  // unique match. A reporter can request the enclosing expression for ambiguous text;
  // readers narrowing their input must keep their original source instead.
  select(text: string, enclosing = false): SourceText | null {
    text = text.trim()
    const escaped = text.split(/\s+/).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    if (!text.trim()) return null
    const matches = [...this.text.matchAll(new RegExp(escaped.join("\\s+"), "g"))].filter(
      (m) =>
        !(/[A-Za-z0-9_]/.test(text[0]) && /[A-Za-z0-9_]/.test(this.text[m.index! - 1] ?? "")) &&
        !(
          /[A-Za-z0-9_]/.test(text.at(-1)!) &&
          /[A-Za-z0-9_]/.test(this.text[m.index! + m[0].length] ?? "")
        ),
    )
    if (matches.length !== 1)
      return enclosing && matches.length ? SourceText.writtenAs(text, this.span, this.owner) : null
    const found = this.slice(matches[0].index!, matches[0].index! + matches[0][0].length)
    if (found.text === text) return found
    const positions: Span[] = []
    let at = 0
    for (let i = 0; i < text.length; i++) {
      if (/\s/.test(text[i])) {
        positions.push(found.positions[at])
        if (!/\s/.test(text[i + 1] ?? ""))
          while (at < found.text.length && /\s/.test(found.text[at])) at++
      } else positions.push(found.positions[at++])
    }
    return new SourceText(text, positions, this.owner)
  }
}

// Expanded tokens keep the written token they came from. Repeats copy these positions;
// expanding a named value points back to the name at its use site.
export const tokenSources = (tokens: string[]) =>
  (tokens as string[] & { sources?: SourceText[] }).sources
export function locatedTokens(tokens: string[], sources?: SourceText[]): string[] {
  if (sources) Object.assign(tokens, { sources })
  return tokens
}
export function repeatTokens(tokens: string[], count: number): string[] {
  const sources = tokenSources(tokens)
  return locatedTokens(
    Array.from({ length: count }, () => tokens).flat(),
    sources && Array.from({ length: count }, () => sources).flat(),
  )
}
