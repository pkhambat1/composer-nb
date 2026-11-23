/* A play's duration follows its music. Intrinsic value/line lengths keep their own
   syntax; this modifier controls the whole output, including truncation or silence. */
import type { Block, Text } from "./syntax.ts"
import { SourceText } from "./source.ts"
import type { Span } from "./syntax.ts"
import { lengthPrefix } from "./time.ts"
import { message, type Report } from "./diagnostics.ts"

// Remove a call's outer parentheses while preserving the source positions of its body.
export function unwrapParts(parts: (Text | Block)[], name = ""): (Text | Block)[] | null {
  const first = parts[0]
  if (first?.kind !== "text") return null
  const head = new RegExp(`^${name}\\s*\\(`).exec(first.text)
  if (!head) return null
  let depth = 1
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (p.kind !== "text") continue
    for (let at = i === 0 ? head[0].length : 0; at < p.text.length; at++) {
      if (p.text[at] === "(") depth++
      if (p.text[at] !== ")") continue
      depth--
      if (depth) continue
      if (i !== parts.length - 1 || p.text.slice(at + 1).trim()) return null
      return parts.flatMap((piece, index): (Text | Block)[] => {
        if (piece.kind !== "text") return [piece]
        const source = SourceText.from(piece.text, piece.span)
          .slice(index === 0 ? head[0].length : 0, index === i ? at : piece.text.length)
          .trim()
        return source.text ? [{ kind: "text", text: source.text, span: source.span }] : []
      })
    }
  }
  return null
}

export function playDuration(
  parts: (Text | Block)[],
  line: number,
  error: Report,
): {
  parts: (Text | Block)[]
  bars: number
  has: boolean
  at?: Span
} | null {
  let depth = 0
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]
    if (part.kind !== "text") continue
    for (let column = 0; column < part.text.length; column++) {
      const char = part.text[column]
      if (char === "(") depth++
      else if (char === ")") depth--
      if (
        depth !== 0 ||
        !/^for\b/.test(part.text.slice(column)) ||
        (column > 0 && !/\s/.test(part.text[column - 1]))
      )
        continue
      const duration = lengthPrefix(part.text.slice(column + 3).trim())
      if (index !== parts.length - 1 || !duration.has || duration.rest.trim()) {
        // The duration as written, from for to the end of its text
        error(line, message("play.durationAfter"), part.text.slice(column))
        return null
      }
      const before = part.text.slice(0, column).trimEnd()
      return {
        parts: [...parts.slice(0, index), ...(before ? [{ ...part, text: before }] : [])],
        bars: duration.bars,
        has: true,
        at: SourceText.from(part.text, part.span).slice(column).span,
      }
    }
  }
  return { parts, bars: 0, has: false }
}
