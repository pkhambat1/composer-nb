/* What a line holds, in order: its text and the blocks written in it, as the parser read
   them. A reader asks for what it needs: the words (pieces), the line as text for a
   message (textOf, a block shown as { ... }), the one block a line is (onlyBraces), or
   what follows the head it matched (afterHead). */
import type { Braces, Line, Piece } from "./state.ts"
import { lengthPrefix } from "./time.ts"
import { tokenize } from "./values/steps.ts"

export const isBraces = (p: Piece | undefined): p is Braces => typeof p === "object" && p !== null

// The line as text, each block in it shown as { ... }, for a message or a check of how it's
// written
export const textOf = (parts: Piece[]) =>
  parts
    .map((p) => (isBraces(p) ? "{ ... }" : p))
    .join(" ")
    .trim()

// The words of a line, each block in it a word of its own
export function pieces(parts: Piece[]): Piece[] {
  return parts.flatMap((p): Piece[] => (isBraces(p) ? [p] : tokenize(p)))
}

// The blocks written in a line
export const bracesIn = (parts: Piece[]): Braces[] => parts.filter(isBraces)

// The block a line is, when all it holds is one block
export function onlyBraces(parts: Piece[]): Braces | null {
  const held = parts.filter((p) => isBraces(p) || p.trim())
  return held.length === 1 && isBraces(held[0]) ? held[0] : null
}

// The text a line starts with, before any block in it
export const headOf = (parts: Piece[]) => (typeof parts[0] === "string" ? parts[0] : "")

// What follows the first `n` characters of a line's text: a line's value after its head
// (kick: ..., steps fig = ...). The head is always in the text before the first block.
export const afterHead = (parts: Piece[], n: number) => withHead(parts, headOf(parts).slice(n))

// A line from text alone
export const plain = (ln: number, text: string): Line => ({ ln, parts: text ? [text] : [] })

// A line with its text before any block replaced by `head`: what's left after a reader took
// a head it matched (kick: ..., 4 bars ...)
export function withHead(parts: Piece[], head: string): Piece[] {
  const rest = typeof parts[0] === "string" ? parts.slice(1) : parts
  return head.trim() ? [head.trim(), ...rest] : rest
}

// A length written in front of a line, and what follows it: 4 bars { ... }
export function lengthIn(parts: Piece[]) {
  const len = lengthPrefix(headOf(parts))
  return { ...len, rest: len.has ? withHead(parts, len.rest) : parts }
}

// A line's parts between its commas, each block in the part it's written in
export function commaGroups(parts: Piece[]): Piece[][] {
  const groups: Piece[][] = [[]]
  for (const p of parts) {
    if (isBraces(p)) {
      groups[groups.length - 1].push(p)
      continue
    }
    p.split(",").forEach((text, i) => {
      if (i > 0) groups.push([])
      if (text.trim()) groups[groups.length - 1].push(text.trim())
    })
  }
  return groups
}
