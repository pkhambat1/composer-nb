/* The parser: a cell's tokens as a tree of statements and blocks (see syntax.ts). It
   descends recursively, one method per rule, since blocks nest: a statement is everything
   up to the line break that ends it, holding text and blocks; a block is statements up to
   its }. A statement's kind comes from how it starts. What comes after its head stays
   text, which the line readers read (lines.ts, sequence.ts, values/). */
import { Lexer } from "./lexer.ts"
import type {
  Block,
  Cell,
  Node,
  ParseError,
  Span,
  Statement,
  Text,
  Token,
  Value,
} from "./syntax.ts"
import { TYPES } from "./vocab.ts"

const NAME = "[A-Za-z][A-Za-z0-9]*"
const TYPED = new RegExp(`^(${TYPES.join("|")})\\s+(${NAME})\\s*=\\s*`)
const UNTYPED = new RegExp(`^(${NAME})\\s*=\\s*`)
const TRACK = new RegExp(`^(${NAME}(?:\\.[A-Za-z0-9]+)?)\\s*:\\s*`)
// A statement that starts with one of these words, and what kind of statement it is
const HEADS = { set: "set", with: "with", play: "play", bar: "place", every: "pace" } as const

export class Parser {
  readonly #tokens: Token[]
  #at = 0
  readonly #errors: ParseError[] = []

  constructor(tokens: Token[]) {
    this.#tokens = tokens
  }

  // A cell's source as statements, and what's wrong with how its braces are put together.
  static parse(src: string): Cell {
    const parser = new Parser(Lexer.tokens(src))
    const statements = parser.#statements(null)
    return { statements, errors: parser.#errors }
  }

  // Statements up to the } that closes `open`, or to the end of the cell when there's no
  // open brace.
  #statements(open: Token | null): Statement[] {
    const out: Statement[] = []
    for (;;) {
      const t = this.#tokens[this.#at]
      if (!t) {
        if (open) this.#errors.push({ code: "brace.unclosed", span: open.span })
        return out
      }
      if (t.kind === "close") {
        if (open) return out
        this.#errors.push({ code: "brace.stray", span: t.span })
        this.#at++
      } else if (t.kind === "newline" || t.kind === "comment" || isBlank(t)) {
        this.#at++
      } else {
        const s = this.#statement()
        if (s) out.push(s)
      }
    }
  }

  // One statement: its text and blocks up to the line break that ends it.
  #statement(): Statement | null {
    const parts: (Text | Block)[] = []
    for (;;) {
      const t = this.#tokens[this.#at]
      if (!t || t.kind === "newline" || t.kind === "close") break
      this.#at++
      if (t.kind === "open") {
        const statements = this.#statements(t)
        const close = this.#tokens[this.#at]
        if (close) this.#at++
        parts.push({ kind: "block", statements, span: join(t.span, (close ?? t).span) })
      } else if (t.kind !== "comment") {
        const last = parts[parts.length - 1]
        if (last?.kind === "text") {
          last.text += t.text
          last.span = join(last.span, t.span)
        } else parts.push({ kind: "text", text: t.text, span: t.span })
      }
    }
    const value = trimmed(parts)
    return value.span ? { ...classify(value, value.span), parts: value.parts } : null
  }
}

// A statement's kind, from how its first text starts. Its head is taken off what it holds.
function classify(value: Value, span: Span): Node {
  const first = value.parts[0]
  const text = first?.kind === "text" ? first.text : ""
  const word = /^[a-z]+(?=\s|$)/.exec(text)?.[0] as keyof typeof HEADS | undefined
  const head = word && HEADS[word]
  if (head === "set") {
    const m = /^set\s+(\S*)\s*/.exec(text)
    return { kind: "set", span, setting: m?.[1] ?? "", value: after(value, m?.[0] ?? "set") }
  }
  if (head === "with") {
    const at = value.parts.findIndex((p) => p.kind === "block")
    const header = at < 0 ? value.parts : value.parts.slice(0, at)
    return {
      kind: "with",
      span,
      settings: after(trimmed(header), "with"),
      value: trimmed(at < 0 ? [] : value.parts.slice(at)),
    }
  }
  if (head === "play") return { kind: "play", span, value: after(value, "play") }
  if (head === "place" || head === "pace") return { kind: head, span, value }
  const typed = TYPED.exec(text)
  if (typed) {
    return { kind: "decl", span, type: typed[1], name: typed[2], value: after(value, typed[0]) }
  }
  const untyped = UNTYPED.exec(text)
  if (untyped)
    return { kind: "decl", span, type: null, name: untyped[1], value: after(value, untyped[0]) }
  const track = TRACK.exec(text)
  if (track) return { kind: "track", span, part: track[1], value: after(value, track[0]) }
  return { kind: "line", span, value }
}

// `value` with `head` taken off the front of its first text.
function after(value: Value, head: string): Value {
  const [first, ...rest] = value.parts
  if (first?.kind !== "text") return value
  const text = first.text.slice(head.length)
  const span = { ...first.span, col: first.span.col + head.length }
  return trimmed([{ kind: "text", text, span }, ...rest])
}

// Parts without the space around them, and without a text that's only space.
function trimmed(parts: (Text | Block)[]): Value {
  const out = parts
    .map((p) => (p.kind === "text" ? trimText(p) : p))
    .filter((p): p is Text | Block => p !== null)
  const span = out.length ? join(out[0].span, out[out.length - 1].span) : null
  return { parts: out, span }
}

// A text without the space around it, and its span moved to match; null if it's only space.
function trimText(t: Text): Text | null {
  const text = t.text.trim()
  if (!text) return null
  const lead = t.text.slice(0, t.text.indexOf(text[0])).split("\n")
  const line = t.span.line + lead.length - 1
  const col = lead.length > 1 ? lead[lead.length - 1].length : t.span.col + lead[0].length
  return { kind: "text", text, span: { line, col, ...endAfter({ line, col }, text) } }
}

// Where text written from `start` ends.
function endAfter(start: { line: number; col: number }, text: string) {
  const lines = text.split("\n")
  return lines.length > 1
    ? { endLine: start.line + lines.length - 1, endCol: lines[lines.length - 1].length }
    : { endLine: start.line, endCol: start.col + text.length }
}

const join = (a: Span, b: Span): Span => ({
  line: a.line,
  col: a.col,
  endLine: b.endLine,
  endCol: b.endCol,
})

const isBlank = (t: Token) => (t.kind === "text" || t.kind === "join") && !t.text.trim()
