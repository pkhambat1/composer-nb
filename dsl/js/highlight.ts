/* Colours for the engine's syntax tree. The parser decides statement and block boundaries;
   the lexer supplies comments and punctuation. This module only assigns colours. Errors
   come exclusively from parseCell's diagnostics, including while the source is incomplete. */
import { chordParts } from "./chords.ts"
import { intervalCall, splitOutside } from "./intervals.ts"
import { Lexer } from "./lexer.ts"
import { Parser } from "./parser.ts"
import type { Block, Statement, Text } from "./syntax.ts"
import { KEYWORDS, PITCHED, SETTINGS } from "./vocab.ts"

export type Part = { c: string | null; s: string }
type Kind = "names" | "drum" | "notes" | "chords" | "setting"
const part = (c: string | null, s: string): Part => ({ c, s })
const NOTE =
  /(?:^-[#b]?[1-9]\d*|[\^~]-[#b]?[1-9]\d*|[\^~]?(?:[A-G][#b]?[0-8]?|[#b]?(?:vii|vi|iv|v|iii|ii|i|[1-9]\d*)))|-|_/g

// A chord's written parts, without asking whether that chord is supported.
function chord(token: string): Part[] {
  const [main, ...bass] = chordParts(token)
  const root = /^(-?[#b]?(?:VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i|[1-9]\d*)|[A-G][#b]?)/.exec(
    main,
  )
  if (!root) return [part("tk-word", token)]
  const out = [part("tk-root tk-root-abs", root[0])]
  const suffix = main.slice(root[0].length)
  for (const m of suffix.matchAll(
    /maj|min|sus2|sus4|sus|dim|dom|aug|alt|m|M|\+|add[#b]?(?:1[0-3]|[2-9])|6\/9|[#b](?:1[0-3]|[2-9])|13|11|9|7|6|5|2|4|./g,
  ))
    out.push(
      part(/^(?:maj|min|sus|dim|dom|aug|alt|m|M|\+)/.test(m[0]) ? "tk-quality" : "tk-ext", m[0]),
    )
  for (const name of bass) out.push(part("tk-slash", "/"), part("tk-bass", name))
  return out
}

function value(token: string, kind: Kind): Part[] {
  if (/^\s+$/.test(token)) return [part(null, token)]
  if (token === "|" || token === "%") return [part("tk-bar", token)]
  if (/^[-_]+$/.test(token)) return [part("tk-rest", token)]
  if (kind === "drum") {
    if (/^[-x^~d]+$/.test(token))
      return token
        .split("")
        .map((s) => part(s === "-" ? "tk-rest" : s === "^" ? "tk-step tk-step-acc" : "tk-step", s))
    return [part(/^[\^~dx]?\d+(e|&|a)?$/.test(token) ? "tk-beat" : "tk-word", token)]
  }
  if (kind === "chords") return chord(token)
  if (kind === "notes") {
    const notes = [...token.matchAll(NOTE)]
    if (notes.map((m) => m[0]).join("") === token)
      return notes.map((m) =>
        part(
          m[0] === "-" || m[0] === "_"
            ? "tk-rest"
            : m[0][0] === "^"
              ? "tk-note tk-step-acc"
              : "tk-note",
          m[0],
        ),
      )
    return [part("tk-word", token)]
  }
  return [
    part(kind === "setting" || /^[\d.+/-]+$/.test(token) ? "tk-directive-val" : "tk-word", token),
  ]
}

// Colour a text node's words. Its grammatical role comes from the parser; value readers
// share the engine's interval-call parser so nested calls keep their own arguments.
function words(text: string, initial: Kind): { parts: Part[]; kind: Kind } {
  const out: Part[] = []
  let kind = initial
  let at = 0
  while (at < text.length) {
    const rest = text.slice(at)
    const space = /^\s+/.exec(rest)
    if (space) {
      out.push(part(null, space[0]))
      at += space[0].length
      continue
    }
    const track = /^([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)?)(\s*):/.exec(rest)
    if (track) {
      out.push(part("tk-inst", track[1]), part(null, track[2]), part("tk-punct", ":"))
      kind = (PITCHED as readonly string[]).includes(track[1]) ? "notes" : "drum"
      at += track[0].length
      continue
    }
    const fn = intervalCall(rest)
    if (fn?.call) {
      const call = fn.call
      const head = /^([\^~]?)([a-z][A-Za-z0-9]*)(\s*)\(/.exec(rest)!
      const args = splitOutside(rest.slice(head[0].length, call.end - 1), ",")
      if (head[1]) out.push(part("tk-note tk-step-acc", head[1]))
      out.push(part("tk-directive-key", head[2]), part(null, head[3]), part("tk-punct", "("))
      args.forEach((arg, i) => {
        if (i) out.push(part("tk-punct", ","))
        out.push(...words(arg, i ? "setting" : kind === "names" ? "notes" : kind).parts)
      })
      out.push(part("tk-punct", ")"))
      at += call.end
      continue
    }
    if (rest.startsWith("...")) {
      out.push(part("tk-directive-key", "..."))
      at += 3
      continue
    }
    if (/^[(){},;:=*]/.test(rest)) {
      out.push(part("tk-punct", rest[0]))
      at++
      continue
    }
    const token = /^[^\s(){},;:=*|]+|\|/.exec(rest)![0]
    if (KEYWORDS.includes(token)) {
      out.push(part("tk-directive-key", token))
      if (token === "chords" || token === "notes") kind = token
      else if (token === "steps") kind = "drum"
      else if (token === "pattern" || token === "block" || token === "play") kind = "names"
      else if (token === "set" || token === "with") kind = "setting"
    } else if (kind === "setting" && (SETTINGS as readonly string[]).includes(token)) {
      out.push(part("tk-directive-key", token))
    } else if (/^\s*\*/.test(text.slice(at + token.length))) {
      out.push(part("tk-directive-val", token))
    } else out.push(...value(token, kind))
    at += token.length
  }
  return { parts: out, kind }
}

export function highlightMusic(src: string): Part[][] {
  const classes: (string | null)[] = Array(src.length).fill(null)
  const starts = [0]
  for (let i = 0; i < src.length; i++) if (src[i] === "\n") starts.push(i + 1)
  const offset = (line: number, col: number) => starts[line - 1] + col
  const paint = (from: number, parts: Part[]) => {
    let at = from
    for (const p of parts) {
      classes.fill(p.c, at, at + p.s.length)
      at += p.s.length
    }
  }
  const text = (node: Text, kind: Kind) => {
    const painted = words(node.text, kind)
    paint(offset(node.span.line, node.span.col), painted.parts)
    return painted.kind
  }
  const statement = (s: Statement, outer: Kind) => {
    let kind: Kind = outer
    if (s.kind === "set" || s.kind === "with") kind = "setting"
    else if (s.kind === "decl") kind = "names"
    for (const p of s.parts) {
      if (p.kind === "text") kind = text(p, kind)
      else block(p, kind === "setting" ? "names" : kind)
    }
    // A declaration's name is a name even when its spelling resembles a musical value.
    if (s.kind === "decl") {
      const first = s.parts[0]
      if (first?.kind === "text") {
        const m = /^(?:(\S+)\s+)?([A-Za-z][A-Za-z0-9]*)\s*=/.exec(first.text)
        if (m) {
          const from =
            offset(first.span.line, first.span.col) + (m[1] ? m[0].indexOf(m[2], m[1].length) : 0)
          paint(from, [part("tk-word", s.name)])
        }
      }
    }
  }
  const block = (b: Block, kind: Kind) => {
    for (const s of b.statements) statement(s, kind)
  }
  for (const s of Parser.parse(src).statements) statement(s, "names")
  for (const t of Lexer.tokens(src)) {
    if (t.kind === "comment" || t.kind === "open" || t.kind === "close" || t.kind === "separator")
      paint(offset(t.span.line, t.span.col), [
        part(t.kind === "comment" ? "tk-comment" : "tk-punct", t.text),
      ])
  }
  const lines: Part[][] = [[]]
  for (let at = 0; at < src.length; ) {
    if (src[at] === "\n") {
      lines.push([])
      at++
      continue
    }
    let end = at + 1
    while (end < src.length && src[end] !== "\n" && classes[end] === classes[at]) end++
    lines[lines.length - 1].push(part(classes[at], src.slice(at, end)))
    at = end
  }
  return lines
}
