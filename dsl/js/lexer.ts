/* The lexer: a cell's text as tokens (see syntax.ts), each with its span. It's a state
   machine over the characters. Its state is where it is and, for each brace it's inside,
   how many ( are open there: a line break inside ( ) doesn't end a statement, since a
   group in brackets runs on until its ) closes it. Inside braces, newlines are layout:
   commas separate entries. A line break before a line that starts with | doesn't
   end a top-level statement either: that line continues the one above, at a bar line. */
import type { Span, Token, TokenKind } from "./syntax.ts"

export class Lexer {
  readonly #src: string
  #at = 0
  #line = 1
  #col = 0
  // ( still open at each brace level, the cell's own level first
  #parens: number[] = [0]
  #heads: string[] = [""]
  readonly #inside: boolean

  constructor(src: string, inside = false) {
    this.#src = src
    this.#inside = inside
  }

  // Every token in the cell, in order.
  static tokens(src: string, inside = false): Token[] {
    const lexer = new Lexer(src, inside)
    const out: Token[] = []
    for (let t = lexer.next(); t; t = lexer.next()) out.push(t)
    return out
  }

  // The next token, or null at the end of the cell.
  next(): Token | null {
    const src = this.#src
    if (this.#at >= src.length) return null
    const c = src[this.#at]
    if (this.#separator(this.#at)) return this.#take("separator", 1)
    if (c === "\n")
      return this.#take(
        this.#inside || this.#parens.length > 1 || !this.#breaks() ? "join" : "newline",
        1,
      )
    if (c === "{") {
      this.#heads[this.#heads.length - 1] = ""
      this.#parens.push(0)
      this.#heads.push("")
      return this.#take("open", 1)
    }
    if (c === "}") {
      if (this.#parens.length > 1) {
        this.#parens.pop()
        this.#heads.pop()
      }
      return this.#take("close", 1)
    }
    if (src.startsWith("//", this.#at)) {
      const end = src.indexOf("\n", this.#at)
      return this.#take("comment", (end < 0 ? src.length : end) - this.#at)
    }
    // Text runs to the next character that's a token of its own, counting brackets on the
    // way.
    let end = this.#at
    while (
      end < src.length &&
      !"\n{}".includes(src[end]) &&
      !this.#separator(end) &&
      !src.startsWith("//", end)
    ) {
      const level = this.#parens.length - 1
      if (src[end] === "(") this.#parens[level]++
      if (src[end] === ")" && this.#parens[level] > 0) this.#parens[level]--
      end++
    }
    return this.#take("text", end - this.#at)
  }

  // Commas inside parentheses belong to their expression. A with header keeps its
  // setting commas until its opening brace; every other brace-level comma ends an entry.
  // Keep obsolete semicolons as separators so the parser can give a migration error.
  #separator(at: number): boolean {
    if (this.#src[at] === ";") return true
    const level = this.#parens.length - 1
    if (this.#src[at] !== "," || (!this.#inside && !level) || this.#parens[level]) return false
    const head = this.#heads[level] + this.#src.slice(this.#at, at)
    return !/\bwith(?:\s|$)/.test(head)
  }

  // Whether the line break here ends a statement. Inside ( ) it doesn't. Nor does it when the
  // next line starts with |, passing over lines that are only a comment, unless the line
  // above is blank or opens or closes a brace.
  #breaks(): boolean {
    if (this.#parens[this.#parens.length - 1] > 0) return false
    const src = this.#src
    let end = this.#at
    let above = ""
    for (;;) {
      const start = src.lastIndexOf("\n", end - 1) + 1
      const raw = src.slice(start, end)
      above = raw.replace(/\/\/.*$/, "").trim()
      if (above || !raw.trim() || start === 0) break
      end = start - 1
    }
    if (!above || /^[{}]|[{}]$/.test(above)) return true
    const comment = /^[ \t]*\/\/[^\n]*\n/
    let rest = src.slice(this.#at + 1)
    while (comment.test(rest)) rest = rest.replace(comment, "")
    return !/^[ \t]*\|/.test(rest)
  }

  #take(kind: TokenKind, length: number): Token {
    const text = this.#src.slice(this.#at, this.#at + length)
    const level = this.#heads.length - 1
    if (kind === "text" || kind === "join") this.#heads[level] += text
    else if (kind === "separator" || kind === "newline") this.#heads[level] = ""
    const start = { line: this.#line, col: this.#col }
    for (const ch of text) {
      if (ch === "\n") {
        this.#line++
        this.#col = 0
      } else this.#col++
    }
    this.#at += length
    const span: Span = { ...start, endLine: this.#line, endCol: this.#col }
    return { kind, text, span }
  }
}
