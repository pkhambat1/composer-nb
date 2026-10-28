/* Sequences: what one line of a block plays, as items. A pattern's name, a block, a with
   and its block, or a group in brackets that plays what's in it in order, each with the
   length in front of it, if any. */
import { undefinedName } from "./resolve.ts"
import { readWithHeader, WITH_HELP, type SettingWords } from "./settings.ts"
import type { Line, LineBlock, Section, State } from "./state.ts"
import { lengthPrefix, MAX_BARS, type Report } from "./time.ts"

// Something a block plays as a pattern: a named one, a block without a name, or a with's
export type Playable = Partial<Section> & {
  ln: number
  lines: Line[]
  bars: number
  anon?: boolean
  shown?: string // a with's header, as written
}
// One thing a line plays
export type Item = {
  name?: string
  items?: Item[]
  block?: Playable | LineBlock
  with?: SettingWords[]
  shown?: string
  bars: number
}

// How many ( in `text` are still open at its end. A block inside it is a {#1} by now, so
// only the line's own brackets count.
export function openParens(text: string): number {
  let depth = 0
  for (const c of text) {
    if (c === "(") depth++
    else if (c === ")") depth--
  }
  return depth
}

// What one line plays, as an item: a pattern's name, a pattern without a name ({#1}, kept in
// `blocks`) or a group in brackets, with the length in front of it, if any, which it
// repeats to fill. Lengths are arithmetic: (1+2) bars groove. A group holds what plays in
// order, one after another, separated by spaces or new lines: names, blocks, groups, and
// lines of their own (piano: C4---), each a block of one line. ( ) is the one way to put
// things in order, so a newline never decides it: on lines of their own, things play
// together, and two things on one line without brackets are a mistake that says so.
// Returns the item in a list of one, or null after saying what's wrong. `st` is the state,
// so that a name that isn't defined is said first.
export function readSequence(
  line: string,
  ln: number,
  err: Report,
  blocks: Record<string, LineBlock> | null | undefined = {},
  st: State | null = null,
): Item[] | null {
  const text = line.replace(/^\s+|\s+$/g, "")
  let i = 0
  let ok = true
  const fail = (msg: string) => {
    if (ok) err(ln, msg)
    ok = false
  }
  const ws = () => {
    while (/\s/.test(text[i] || "")) i++
  }
  const undefinedItem = (it: Item) => (it.name && st && !st.sections[it.name] ? it.name : null)
  let last: Item | null = null // the thing read last, which a * after it would want repeated
  const said = (it: Item | null) => it?.name || (it?.items ? "( ... )" : it ? "{ ... }" : "groove")
  // One thing, at i: what's written in front of it, then a group, a block, a line of its
  // own (in a group), or a name. null after saying what's wrong.
  const item = (inGroup: boolean): Item | null => {
    const it = thing(inGroup)
    if (it) last = it
    return it
  }
  const thing = (inGroup: boolean): Item | null => {
    if (text[i] === "*") {
      fail(`* only multiplies numbers. To repeat, put a length in front: 4 bars ${said(last)}`)
      return null
    }
    let bars = 0
    const len = lengthPrefix(text.slice(i))
    if (len.has) {
      if (!(len.bars > 0 && len.bars <= MAX_BARS)) {
        fail(`A length is a number of bars up to ${MAX_BARS}, e.g. 3 bars`)
        return null
      }
      if (!len.rest) {
        fail(`${text.slice(i).trim()} of what? Put a pattern or its name after it`)
        return null
      }
      bars = len.bars
      i = text.length - len.rest.length
    }
    if (text[i] === "(") {
      i++
      const items = group()
      return items && { items, bars }
    }
    // with octave 2 { ... }: a block, played with those settings
    if (/^with(?![A-Za-z0-9.])/.test(text.slice(i))) {
      const after = text.slice(i + 4)
      const close = /\{#\d+\}/.exec(after.split("\n")[0])
      if (!close || !blocks?.[close[0]]) {
        fail(WITH_HELP)
        return null
      }
      const head = after.slice(0, close.index)
      const settings = readWithHeader(head, ln, err)
      if (!settings) {
        ok = false
        return null
      }
      i += 4 + close.index + close[0].length
      return { with: settings, shown: `with ${head.trim()}`, block: blocks[close[0]]!, bars }
    }
    const key = /^\{#\d+\}/.exec(text.slice(i))
    if (key && blocks?.[key[0]]) {
      i += key[0].length
      return { block: blocks[key[0]]!, bars }
    }
    // piano: C4---D4---, in a group: a line of its own, which runs to the end of its line
    // or to the group's ), and plays as a block of one line
    if (inGroup && /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)?\s*:/.test(text.slice(i))) {
      const start = i
      let depth = 0
      while (i < text.length && text[i] !== "\n" && !(text[i] === ")" && depth === 0)) {
        if (text[i] === "(") depth++
        else if (text[i] === ")") depth--
        i++
      }
      const own = text.slice(start, i).trim()
      const theirs = Object.fromEntries(
        Object.entries(blocks || {}).filter(([k]) => own.includes(k)),
      )
      const lines: Line[] = [{ ln, text: own, blocks: Object.keys(theirs).length ? theirs : null }]
      return { block: { anon: true, ln, lines, bars: 0 }, bars }
    }
    const name = /^[A-Za-z][A-Za-z0-9]*/.exec(text.slice(i))
    if (!name) {
      const tok = text.slice(i).split(/\s/)[0]
      fail(
        /^\d/.test(tok)
          ? `"${tok}" needs bars after it, e.g. 3 bars groove`
          : `"${tok}" doesn't belong here. A line plays a pattern's name, a block, or ( ) ` +
              "with what plays in order in it, and a length can go in front: 4 bars groove",
      )
      return null
    }
    // of counts a note or a chord from another, so it's on an instrument's line, never
    // between patterns
    if (name[0] === "of") {
      fail("of counts a note or a chord from another: piano: 5 of C3, or piano: chords V7 of V")
      return null
    }
    i += name[0].length
    return { name: name[0], bars }
  }
  // What's in a group, up to its ), in order
  const group = (): Item[] | null => {
    const out: Item[] = []
    for (;;) {
      ws()
      if (i >= text.length) {
        fail("A ( is missing its )")
        return null
      }
      if (text[i] === ")") {
        i++
        if (!out.length) {
          fail("These brackets have nothing in them")
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
  if (i < text.length) {
    if (text[i] === ")") {
      fail("This ) doesn't close anything")
      return null
    }
    // More on the line: what plays in order goes in brackets
    const row = [first]
    while (ok && i < text.length) {
      const it = text[i] === ")" ? null : item(true)
      if (!it) break
      row.push(it)
      ws()
    }
    if (!ok) return null
    const missing = row.map(undefinedItem).find(Boolean)
    if (missing) fail(undefinedName(missing, st!))
    else {
      const shown = text.replace(/\{#\d+\}/g, "{ ... }").replace(/\s+/g, " ")
      fail(`What plays in order goes in brackets: (${shown})`)
    }
    return null
  }
  return [first]
}
