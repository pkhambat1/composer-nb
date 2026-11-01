/* A play's duration follows its music. Intrinsic value/line lengths keep their own
   syntax; this modifier controls the whole output, including truncation or silence. */
import type { Block, Text } from "./syntax.ts"
import { lengthPrefix, type Report } from "./time.ts"

export function playDuration(
  parts: (Text | Block)[],
  line: number,
  error: Report,
): {
  parts: (Text | Block)[]
  bars: number
  has: boolean
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
        error(line, "A play's duration follows its music: play groove for 2 bars")
        return null
      }
      const before = part.text.slice(0, column).trimEnd()
      return {
        parts: [...parts.slice(0, index), ...(before ? [{ ...part, text: before }] : [])],
        bars: duration.bars,
        has: true,
      }
    }
  }
  return { parts, bars: 0, has: false }
}
