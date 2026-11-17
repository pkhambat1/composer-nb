/* A chord suffix applied to every chord of a chart. Unlike interval calls, the
   second argument is a single suffix, never another musical value or a count. */
import { isChordExtension } from "./chords.ts"
import { message } from "./diagnostics.ts"
import { splitOutside } from "./intervals.ts"

export type ExtensionCall = {
  name: "extend"
  body: string
  modifier: string
  end: number
  prefix: string
}

export function extensionCall(
  text: string,
): { call: ExtensionCall; error?: never } | { error: string; call?: never } | null {
  const head = /^([\^~]?)extend\s*\(/.exec(text)
  if (!head) return null
  let depth = 1
  let end = head[0].length
  for (; end < text.length && depth; end++) {
    if (text[end] === "(") depth++
    else if (text[end] === ")") depth--
    if (depth > 32) return { error: message("interval.nested") }
  }
  if (depth) return { error: message("interval.unclosed", { name: "extend" }) }
  const args = splitOutside(text.slice(head[0].length, end - 1), ",").map((arg) => arg.trim())
  if (args.length !== 2 || !args[0] || !args[1]) return { error: message("extension.arguments") }
  if (!isChordExtension(args[1]))
    return { error: message("extension.modifier", { modifier: args[1] }) }
  return {
    call: { name: "extend", body: args[0], modifier: args[1], end, prefix: head[1] },
  }
}

export const wrapExtension = (call: ExtensionCall, value: string) =>
  `extend(${value}, ${call.modifier})`
