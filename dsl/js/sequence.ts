/* Sequences: what one line of a block plays, as items. A pattern's name, a block, a with
   and its block, or a group in brackets that plays what's in it in order, each with the
   length in front of it, if any. */
import { atOffset, reportIn, type At, type Report } from "./diagnostics.ts"
import { undefinedName } from "./resolve.ts"
import { readWithHeader, WITH_HELP, type SettingWords } from "./settings.ts"
import { isBraces, textOf, sourcesOf, located } from "./parts.ts"
import { SourceText } from "./source.ts"
import type { Span } from "./syntax.ts"
import type { Braces, Line, Piece, Section, State } from "./state.ts"
import { lengthPrefix, MAX_BARS } from "./time.ts"

// Something a block plays as a pattern: a named one, a block without a name, or a with's
export type Playable = Partial<Section> & {
  ln: number
  lines: Line[]
  bars: number
  anon?: boolean
  shown?: string // a with's header, as written
}
// What a block without a type is told
const UNTYPED_BRACES = "These braces need a type: pattern { ... } repeats, block { ... } plays once"
// One thing a line plays
export type Item = {
  span?: Span
  name?: string
  items?: Item[]
  block?: Playable
  with?: SettingWords[]
  shown?: string
  bars: number
}

// Where an item is written: its name, the ( of a group, a with's header, or the type in
// front of braces
export const itemAt = (it: Item) =>
  it.span ?? (it.name || (it.items ? "(" : it.with ? it.shown! : (it.block?.type ?? "pattern")))

// What one line plays, as an item: a pattern's name, a block, or a group in brackets, with
// the length in front of it, if any, which it repeats to fill. Lengths are arithmetic:
// (1+2) bars groove. A group holds what plays in order, one after another, separated by
// spaces or new lines: names, blocks, groups, and lines of their own (piano: C4---), each a
// block of one line. ( ) is the one way to put things in order, so a newline never decides
// it: on lines of their own, things play together, and two things on one line without
// brackets are a mistake that says so. Returns the item in a list of one, or null after
// saying what's wrong. `st` is the state, so that a name that isn't defined is said first.
export function readSequence(
  parts: Piece[],
  ln: number,
  err: Report,
  st: State | null = null,
): Item[] | null {
  // The line one unit at a time: each character of its text, and each block whole
  const units: Piece[] = parts.flatMap((p): Piece[] => (isBraces(p) ? [p] : p.split("")))
  const sources = sourcesOf(parts)
  const positions = sources?.flatMap((s, i) =>
    isBraces(parts[i]) ? [s.positions[0]] : [...s.positions],
  )
  const written =
    positions &&
    new SourceText(
      units.map((p) => (isBraces(p) ? "{" : p)).join(""),
      positions,
      sources?.find((s) => s.owner)?.owner,
    )
  err = reportIn(err, written)
  const here = (from: number, to: number, fallback: string) => atOffset(err, from, to, fallback)
  const space = (k: number) => typeof units[k] === "string" && /\s/.test(units[k] as string)
  let end = units.length
  while (end > 0 && space(end - 1)) end--
  let i = 0
  let ok = true
  const fail = (msg: string, at: At) => {
    if (ok) err(ln, msg, at)
    ok = false
  }
  // The character at k, or "" for a block or the end
  const ch = (k: number) => (k < end && typeof units[k] === "string" ? (units[k] as string) : "")
  // The text from k up to the next block
  const textFrom = (k: number) => {
    let s = ""
    while (k < end && typeof units[k] === "string") s += units[k++]
    return s
  }
  // Units from `from` to `to`, as the parts of a line
  const partsOf = (from: number, to: number): Piece[] => {
    const out: Piece[] = []
    const maps: SourceText[] = []
    for (let at = from; at < to; at++) {
      const u = units[at]
      const map = written?.slice(at, at + 1)
      if (isBraces(u) || typeof out[out.length - 1] !== "string") {
        out.push(u)
        if (map) maps.push(isBraces(u) ? SourceText.block(map.span, map.owner) : map)
      } else {
        out[out.length - 1] += u
        if (map) maps[maps.length - 1] = SourceText.join([maps[maps.length - 1], map])
      }
    }
    return located(
      out.map((p) => (isBraces(p) ? p : p.trim())).filter((p) => isBraces(p) || p),
      written && maps.map((s) => s.trim()).filter((s) => s.text),
    )
  }
  const ws = () => {
    while (space(i)) i++
  }
  const playable = (b: Braces, type?: Playable["type"]): Playable => ({
    anon: true,
    type,
    ln: b.ln,
    lines: b.lines,
    bars: 0,
  })
  const undefinedItem = (it: Item) => (it.name && st && !st.sections[it.name] ? it.name : null)
  let last: Item | null = null // the thing read last, which a * after it would want repeated
  const said = (it: Item | null) =>
    it?.name || (it?.items ? "( ... )" : it ? `${it.block?.type ?? "pattern"} { ... }` : "groove")
  // One thing, at i: what's written in front of it, then a group, a block, a line of its
  // own (in a group), or a name. null after saying what's wrong.
  const item = (inGroup: boolean): Item | null => {
    const it = thing(inGroup)
    if (it) last = it
    return it
  }
  const thing = (inGroup: boolean): Item | null => {
    if (ch(i) === "*") {
      fail(`* only multiplies numbers. To repeat, put a length in front: 4 bars ${said(last)}`, "*")
      return null
    }
    let bars = 0
    const head = textFrom(i)
    const len = lengthPrefix(head)
    // The length as written
    const length = head.slice(0, head.length - len.rest.length).trim()
    if (len.has) {
      if (!(len.bars > 0 && len.bars <= MAX_BARS)) {
        fail(`A length is a number of bars up to ${MAX_BARS}, e.g. 3 bars`, length)
        return null
      }
      const start = i
      const trailing = head.length - head.trimEnd().length
      i += len.rest ? head.length - trailing - len.rest.length : head.length
      if (i >= end) {
        fail(`${textOf(partsOf(start, end))} of what? Put a pattern or its name after it`, length)
        return null
      }
      bars = len.bars
    }
    if (ch(i) === "(") {
      const span = written?.slice(i, i + 1).span
      i++
      const items = group()
      return items && { items, bars, span }
    }
    // with octave 2 { ... }: a block, played with those settings
    if (/^with(?![A-Za-z0-9.])/.test(textFrom(i))) {
      // its header runs to the block on its line
      let j = i + 4
      while (j < end && ch(j) && ch(j) !== "\n") j++
      const block = units[j]
      if (!isBraces(block)) {
        fail(WITH_HELP, "with")
        return null
      }
      // A with in a group can be on a later line than the line the group starts on
      const span = written?.slice(i, i + 4).span
      const shown = textFrom(i + 4)
      const settings = readWithHeader(shown, span?.line ?? ln, err)
      if (!settings) {
        ok = false
        return null
      }
      i = j + 1
      return { with: settings, shown: `with ${shown.trim()}`, block: playable(block), bars, span }
    }
    // pattern { ... }, block { ... }: braces that are a value say their type
    const word = /^(pattern|block)\s*$/.exec(textFrom(i))
    const typed = word ? units[i + word[0].length] : undefined
    if (word && isBraces(typed)) {
      i += word[0].length + 1
      return { block: playable(typed, word[1] as Playable["type"]), bars }
    }
    const block = units[i]
    if (isBraces(block)) {
      if (!block.type) {
        fail(UNTYPED_BRACES, "{")
        return null
      }
      i++
      return { block: playable(block, block.type), bars }
    }
    // piano: C4---D4---, in a group: a line of its own, which runs to the end of its line
    // or to the group's ), and plays as a block of one line
    if (inGroup && /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)?\s*:/.test(textFrom(i))) {
      const start = i
      let depth = 0
      while (i < end && ch(i) !== "\n" && !(ch(i) === ")" && depth === 0)) {
        if (ch(i) === "(") depth++
        else if (ch(i) === ")") depth--
        i++
      }
      const lines: Line[] = [{ ln, parts: partsOf(start, i) }]
      return { block: { anon: true, ln, lines, bars: 0 }, bars }
    }
    const name = /^[A-Za-z][A-Za-z0-9]*/.exec(textFrom(i))
    if (!name) {
      const tok = textFrom(i).split(/\s/)[0]
      fail(
        /^\d/.test(tok)
          ? `"${tok}" needs bars after it, e.g. 3 bars groove`
          : `"${tok}" doesn't belong here. A line plays a pattern's name, a block, or ( ) ` +
              "with what plays in order in it, and a length can go in front: 4 bars groove",
        tok,
      )
      return null
    }
    const span = written?.slice(i, i + name[0].length).span
    i += name[0].length
    return { name: name[0], bars, span }
  }
  // What's in a group, up to its ), in order
  const group = (): Item[] | null => {
    const out: Item[] = []
    const open = i - 1 // where its ( is
    for (;;) {
      ws()
      if (i >= end) {
        fail("A ( is missing its )", here(open, open + 1, "("))
        return null
      }
      if (ch(i) === ")") {
        i++
        if (!out.length) {
          fail("These brackets have nothing in them", here(open, i, units.slice(open, i).join("")))
          return null
        }
        return out
      }
      const it = item(true)
      if (!it) return null
      out.push(it)
    }
  }
  ws()
  const first = item(false)
  if (!first) return null
  ws()
  if (i < end) {
    if (ch(i) === ")") {
      fail("This ) doesn't close anything", here(i, i + 1, ")"))
      return null
    }
    // More on the line: what plays in order goes in brackets. A name that isn't defined is
    // said first.
    const unknown = undefinedItem(first)
    if (unknown) {
      fail(undefinedName(unknown, st!), itemAt(first))
      return null
    }
    const row = [first]
    while (ok && i < end) {
      const it = ch(i) === ")" ? null : item(true)
      if (!it) break
      row.push(it)
      ws()
    }
    if (!ok) return null
    const missing = row.find((it) => undefinedItem(it))
    if (missing) fail(undefinedName(missing.name!, st!), itemAt(missing))
    else {
      // The line as written, when it's all text; otherwise the second thing in it
      const written = parts.every((p) => typeof p === "string") ? parts.join("") : itemAt(row[1])
      fail(`What plays in order goes in brackets: (${textOf(parts).replace(/\s+/g, " ")})`, written)
    }
    return null
  }
  return [first]
}
