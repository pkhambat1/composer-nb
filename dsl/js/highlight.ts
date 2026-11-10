/* Syntax highlighter for music cells (see language.ts).
   Exposes highlightMusic(src) -> lines of token parts for React rendering.
   Each part: { c: className | null, s: text }
   Token classes (used by CSS):
     .tk-comment, .tk-directive-key (keywords and settings), .tk-directive-val,
     .tk-inst, .tk-word (your own names), .tk-punct, .tk-bar, .tk-root, .tk-quality,
     .tk-ext, .tk-rest, .tk-slash, .tk-bass, .tk-beat, .tk-step, .tk-step-acc,
     .tk-note (a note on a pitched line),
     .tk-error
   Whitespace is kept exactly, so the layer lines up with the textarea under it. */
import { KEYWORDS, LANES, PARTS, PITCHED, SETTINGS, SWING, TYPES, UNITS } from "./language.ts"
import { chordParts, isDegreeChord, parseKey } from "./chords.ts"
import { Lexer } from "./lexer.ts"
import { intervalCall, splitOutside, callSegments } from "./intervals.ts"
import { among, modeNamed, soundsOf, TYPED_BRACES_RE } from "./vocab.ts"

// A run of a line's text, and the class it's coloured with (null for none)
export type Part = { c: string | null; s: string }
// What a value holds: a drum's steps ("drum"), notes, a chart of chords ("chord"), what a
// pitched instrument's line holds ("pitched": notes, or chords and then a chart), or
// anything a name could hold ("word")
type Kind = "drum" | "notes" | "chord" | "pitched" | "word"
// What a block holds: a drum's layers of steps, a pitched instrument's layers, or lines
type Holds = "steps" | "pitched" | "lines"
// Where a line stands: how many groups ( ) are open, and whether a thing has been written
// outside them (see names)
type Stand = { depth: number; took: boolean; value?: boolean }

const ROMAN_RE = /^(-?[#b]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i|[1-9]\d*)(.*)$/
const STEPS_RE = /^[-x^~d]+$/
// A beat, with how it's hit in front when that isn't a plain hit: 4, 2e, ^4, ~3a, d3&
const BEAT_RE = /^[\^~d]?\d+(e|&|a)?$/
// Notes drawn on steps: E---F# E-E--, with # or b, an octave, and ^ or ~ in front; or
// Signed degrees count through the scale. Only a leading minus (or one after ^/~)
// belongs to a number; dashes between notes remain sustains.
const NOTE =
  "(?:^-[#b]?[1-9]\\d*|[\\^~]-[#b]?[1-9]\\d*|[\\^~]?(?:[A-G][#b]?[0-8]?|[#b]?(?:vii|vi|iv|v|iii|ii|i|[1-9]\\d*)))"
const NOTES_RE = new RegExp(`^(?:-|_|${NOTE})+$`)
const NOTE_AT = new RegExp(`${NOTE}|-|_`, "g")
const NAME_RE = /^[A-Za-z][A-Za-z0-9]*$/
// A name of your own: a lowercase letter, then letters and digits (riff, partA)
const OWN_NAME = /^[a-z][A-Za-z0-9]+$/
// What a length's arithmetic is made of: (1+2)*2 bars
const SUM_RE = /^[\d\s./+*()-]*\d[\d\s./+*()-]*$/
const TRACK_RE = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)?\s*:/

const part = (c: string | null, s: string): Part => ({ c, s })

function chordToken(token: string): Part[] {
  if (token.includes("'")) return [part("tk-error", token)]
  const parts: Part[] = []
  let core = token
  let tail: Part[] = []
  if (chordParts(core).length > 1) {
    if (chordParts(core).length > 2) return [part("tk-error", token)]
    const [main, bass] = chordParts(core)
    core = main
    tail = [part("tk-slash", "/"), part("tk-bass", bass)]
  }
  let rest = ""
  const rm = ROMAN_RE.exec(core)
  if (rm) {
    // a numeral is lowercase: the mode makes the chord major or minor
    if (rm[2] !== rm[2].toLowerCase() || (rm[1].startsWith("-") && !/^\d/.test(rm[2])))
      return [part("tk-error", token)]
    parts.push(part("tk-root tk-root-abs", (rm[1] || "") + rm[2]))
    rest = rm[3] || ""
  } else {
    const am = /^([A-G][b#]?)(.*)$/.exec(core)
    if (!am) return [part("tk-error", token)]
    parts.push(part("tk-root tk-root-abs", am[1]))
    rest = am[2] || ""
  }
  // A 6/9 is written 6/9 or m6/9, and only that way
  if (/69|6add9/.test(rest) || (rest.includes("6/9") && !/^[mM]?6\/9$/.test(rest))) {
    return parts.concat(part("tk-error", rest), tail)
  }
  let i = 0
  while (i < rest.length) {
    const r = rest.slice(i)
    const q = /^(maj|min|sus2|sus4|sus|dim|dom|aug|alt|m|M|\+)/.exec(r)
    const e = q
      ? null
      : /^(add[#b]?(?:1[0-3]|[2-9])|6\/9|[#b](?:1[0-3]|[2-9])|13|11|9|7|6|5|2|4)/.exec(r)
    const m = q || e
    if (!m) {
      parts.push(part("tk-error", rest.slice(i)))
      break
    }
    parts.push(part(q ? "tk-quality" : "tk-ext", m[0]))
    i += m[0].length
  }
  return parts.concat(tail)
}

// x--^-~-: each step coloured on its own.
function stepRun(t: string): Part[] {
  return [...t].map((ch) =>
    ch === "-" ? part("tk-rest", ch) : part(ch === "^" ? "tk-step tk-step-acc" : "tk-step", ch),
  )
}

// F---G~F-^E2, i---biii---: each note coloured as the step it is, with its mark and octave.
// A note straight after another one is a mistake: notes don't touch.
function noteRun(t: string): Part[] {
  let afterNote = false
  return t.match(NOTE_AT)!.map((n) => {
    if (n === "-" || n === "_") {
      afterNote = false
      return part("tk-rest", n)
    }
    const touches = afterNote
    afterNote = true
    if (touches) return part("tk-error", n)
    return part(n[0] === "^" ? "tk-note tk-step-acc" : "tk-note", n)
  })
}

// One token of what an instrument plays (or of what a steps, notes or chords name holds).
function valueToken(t: string, kind: Kind): Part[] {
  const fn = intervalCall(t)
  if (fn) {
    if (fn.error || kind === "drum") return [part("tk-error", t)]
    const call = fn.call!
    const head = /^([\^~]?)([a-z][A-Za-z0-9]*)(\s*)\(/.exec(t)!
    const args = splitOutside(t.slice(head[0].length, call.end - 1), ",")
    const tail = t.slice(call.end)
    return [
      ...(head[1] ? [part(kind === "notes" ? "tk-note tk-step-acc" : "tk-error", head[1])] : []),
      part("tk-directive-key", head[2]),
      part(null, head[3]),
      part("tk-punct", "("),
      ...values(args[0], kind),
      ...(args.length === 2
        ? [
            part("tk-punct", ","),
            ...pieces(args[1], /(\s+)/).map((p) =>
              part(/^\s+$/.test(p) ? null : "tk-directive-val", p),
            ),
          ]
        : []),
      part("tk-punct", ")"),
      ...(tail
        ? kind === "notes" && /^[-_]+$/.test(tail)
          ? noteRun(tail)
          : [part("tk-error", tail)]
        : []),
    ]
  }
  if (t === "|" || t === "%") return [part(kind === "drum" && t === "%" ? "tk-error" : "tk-bar", t)]
  if (t === "{" || t === "}") return [part("tk-punct", t)] // an instrument's block of layers
  // loop is gone: whether something repeats depends on where it is
  if (t === "loop") return [part("tk-error", t)]
  if (kind === "notes") {
    if (NOTES_RE.test(t)) return noteRun(t)
    const name = OWN_NAME.test(t) && !isDegreeChord(t) && !among(TYPES, t)
    return [part(name ? "tk-word" : "tk-error", t)]
  }
  if (t === "-" || t === "_" || t === "rest")
    return [part(kind === "drum" && t !== "-" ? "tk-error" : "tk-rest", t)]
  if (kind !== "chord") {
    if (STEPS_RE.test(t)) return stepRun(t)
    if (kind !== "drum" && BEAT_RE.test(t)) return [part("tk-beat", t)]
  }
  if (OWN_NAME.test(t) && !isDegreeChord(t)) return [part("tk-word", t)]
  if (kind === "drum") return [part("tk-error", t)]
  return chordToken(t)
}

// Splits text into tokens and the whitespace between them, keeping both.
function pieces(text: string, re: RegExp): string[] {
  return text.split(re).filter((p) => p !== "")
}

// A block is the whole of what a kit piece's line, a layer or a steps name holds, so
// anything beside one is a mistake: kick: x--- { x- }. Which of the line's `words` are
// beside a block: the second thing on the line and after it, a block or a run of steps,
// once there's a block among them.
function beside(words: string[]): Set<number> {
  const marked = new Set<number>()
  let depth = 0 // how deep in a block opened on this line
  let things = 0 // the blocks and runs of steps at the top level so far
  let run = false // whether the last of them is a run of steps
  let block = false // whether any of them is a block
  words.forEach((w, k) => {
    if (w === "}") {
      if (depth > 0) depth--
      else {
        // ends a block from an earlier line, which what comes next is beside
        things = 1
        run = false
        block = true
      }
      return
    }
    if (depth > 0) {
      if (w === "{") depth++
      return
    }
    if (w === "{") {
      things++
      run = false
      block = true
      depth++
    } else if (!run) {
      things++
      run = true
    }
    if (things > 1 && block && w !== "," && w !== "|") marked.add(k)
  })
  return marked
}

// The kind of value the last line held, so a line that starts with | (which continues it)
// is coloured the same way. Set by values().
let lastKind: Kind | null = null

// `kind` is what the value is: a drum's steps ("drum"), notes, a chart of chords ("chord"),
// what a pitched instrument's line holds ("pitched": notes, or chords and then a chart),
// or anything a name could hold ("word").
function values(text: string, kind: Kind): Part[] {
  // Layers use the same comma separators as a pattern, with each layer keeping its type.
  const trimmed = text.trim()
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const start = text.indexOf("{")
    const end = text.lastIndexOf("}")
    const body = text.slice(start + 1, end)
    return [
      part(null, text.slice(0, start)),
      part("tk-punct", "{"),
      ...entries(body, (entry) => values(entry, kind), true),
      part("tk-punct", "}"),
      part(null, text.slice(end + 1)),
    ]
  }
  const stepBased =
    kind === "drum" || kind === "notes" || (kind === "pitched" && /^\s*notes\b/.test(text))
  const all = callSegments(text).flatMap((segment) =>
    segment.call
      ? [segment.text]
      : pieces(segment.text, stepBased ? /(\s+|\||[{},;()*])/ : /(\s+|\||[{},;])/),
  )
  const words = all.filter((p) => !/^\s+$/.test(p))
  // piano: chords Am F|C G, bass: notes i---v---: the word that says the type, then its value
  const lead = kind === "pitched" && (words[0] === "chords" || words[0] === "notes")
  if (kind === "pitched") kind = words[0] === "chords" ? "chord" : "notes"
  lastKind = kind
  const mistakes = kind === "drum" ? beside(words) : new Set<number>()
  const timed = kind === "drum" || kind === "notes" // step words, repeats and ...
  const repeatGroups: boolean[] = []
  let k = -1 // which word this is
  return all.flatMap((p) => {
    if (/^\s+$/.test(p)) return [part(null, p)]
    k++
    if (mistakes.has(k)) return [part("tk-error", p)]
    if (lead && k === 0) return [part("tk-directive-key", p)]
    if (p === ";") return [part("tk-error", p)]
    if (stepBased && p === "(") {
      const valid =
        words[k - 1] === "*" && /^\d+$/.test(words[k - 2] ?? "") && Number(words[k - 2]) >= 2
      repeatGroups.push(valid)
      return [part(valid ? "tk-punct" : "tk-error", p)]
    }
    if (stepBased && p === ")") return [part(repeatGroups.pop() ? "tk-punct" : "tk-error", p)]
    if (stepBased && p === "*") return [part(words[k + 1] ? "tk-punct" : "tk-error", p)]
    if (stepBased && words[k + 1] === "*") {
      const valid = /^\d+$/.test(p) && Number.isSafeInteger(Number(p)) && Number(p) >= 2
      return [part(valid ? "tk-directive-val" : "tk-error", p)]
    }
    if (p === ",") return [part(timed ? "tk-error" : "tk-punct", p)]
    if (p === "of") return [part("tk-error", p)]
    if (timed) {
      // ...rest, ...x-, ...G1: the rest of the block, then what fills it
      if (p.startsWith("...")) {
        const thing = p.slice(3)
        if (thing === "rest") return [part("tk-directive-key", "..."), part("tk-error", thing)]
        return [part("tk-directive-key", "..."), ...(thing ? valueToken(thing, kind) : [])]
      }
      // 3 in 8: hits spread over steps
      if (kind === "drum" && p === "in") return [part("tk-directive-key", p)]
      if (kind === "drum" && /^\d+$/.test(p) && (words[k + 1] === "in" || words[k - 1] === "in")) {
        return [part("tk-directive-val", p)]
      }
      if (among(UNITS, p) || p === "rest") return [part("tk-error", p)]
      // always plural, so bar only ever says which bar
      if (["bar", "beat", "step"].includes(p)) return [part("tk-error", p)]
    }
    return valueToken(p, kind)
  })
}

// Whether the ( at `at` holds a length's arithmetic, (1+2) bars, and not a group of names.
function sum(text: string, at: number): boolean {
  let depth = 0
  let end = text.length
  for (let i = at; i < end; i++) {
    if (text[i] === "(") depth++
    else if (text[i] === ")" && --depth === 0) end = i
  }
  return SUM_RE.test(text.slice(at + 1, end))
}

// What a line plays: a pattern's name, a block or a group, with a length in front of it.
// ( ) holds what plays in order, so any number of things go in a group; outside one, a
// second thing on the line is a mistake, since what plays in order goes in brackets. `st`
// is where the line stands: how many groups are open (`depth`), and whether a thing has
// been written outside them (`took`). It carries on through a block on the line, and a
// group that runs over several lines starts its later lines inside it. Braces in a group, or
// on a line of their own (`value`), are a value, so they say their type: pattern { ... }.
function names(text: string, st: Stand = { depth: 0, took: false }): Part[] {
  const placed = placement(text, (before) => names(before, st))
  if (placed) return placed
  const out: Part[] = []
  const open: boolean[] = [] // each ( still open on this line: whether it holds a length's arithmetic
  let number = false // whether the last thing was a number, which * can multiply
  let typed = false // whether a type was written in front of the { that's next
  let at = 0
  // A second thing outside brackets is a mistake; marks that one is written
  const thing = () => {
    const extra = st.depth === 0 && st.took
    if (st.depth === 0) st.took = true
    return extra
  }
  for (const p of pieces(text, /(\s+|[()*{}])/)) {
    const here = at
    at += p.length
    if (/^\s+$/.test(p)) {
      out.push(part(null, p))
      continue
    }
    const wasNumber = number
    number = (/^[\d./+-]+$/.test(p) && /\d/.test(p)) || (number && p === "*")
    // * only does arithmetic: 2*3 bars
    if (p === "*") out.push(part(wasNumber ? "tk-punct" : "tk-error", p))
    else if (p === "(") {
      const arithmetic = sum(text, here)
      open.push(arithmetic)
      if (arithmetic) out.push(part("tk-punct", p))
      else {
        out.push(part(thing() ? "tk-error" : "tk-punct", p))
        st.depth++
      }
    } else if (p === ")") {
      out.push(part("tk-punct", p))
      // (1+2) is a number, like the ones in it. A ) with no ( on this line closes a group
      // opened on a line above.
      if (open.pop()) number = true
      else st.depth = Math.max(0, st.depth - 1)
    } else if (p === "{") {
      // a block takes the rest of its line, and what's after it
      return [...out, ...braces(text.slice(here), st, !typed && (st.depth > 0 || st.value))]
    } else if (TYPED_BRACES_RE.test(text.slice(here)) && !wasNumber) {
      out.push(part("tk-directive-key", p))
      typed = true
    } else if (p === "with" && !wasNumber) {
      // with key E { ... }: a block with its settings, which takes the rest of the line too
      return [...out, part("tk-directive-key", p), ...withHead(text.slice(at), st)]
    } else if (p === "}") out.push(part("tk-punct", p))
    else if (p === "bars") out.push(part("tk-directive-key", p))
    // a length is always plural: 1 bars
    else if (p === "bar") out.push(part("tk-error", p))
    else if (number) out.push(part("tk-directive-val", p))
    // after a number only bars can follow, so anything else there is a mistake: 4 barz
    else if (wasNumber) out.push(part("tk-error", p))
    else out.push(part(NAME_RE.test(p) && !thing() ? "tk-word" : "tk-error", p))
  }
  return out
}

// A length in front of something: "3 bars " → its parts, and what's left, which starts
// at its first character so that an instrument's line or every after the length is read
// as one.
function length(text: string): { parts: Part[]; rest: string } {
  const m = /^(\S+)(\s+)(bars?)(?![A-Za-z0-9])(\s*)/.exec(text)
  // A count's brackets close in it: ((1+2) bars a b) is a group that starts with a length
  const balanced = (n: string) => (n.match(/\(/g) || []).length === (n.match(/\)/g) || []).length
  if (!m || !/^[\d(]/.test(m[1]) || !balanced(m[1])) return { parts: [], rest: text }
  return {
    parts: [
      part("tk-directive-val", m[1]),
      part(null, m[2]),
      // a length is always plural: 1 bars
      part(m[3] === "bars" ? "tk-directive-key" : "tk-error", m[3]),
      part(null, m[4]),
    ],
    rest: text.slice(m[0].length),
  }
}

// A position follows its value. Preserve whitespace so editor offsets stay exact.
function placement(text: string, read: (text: string) => Part[]): Part[] | null {
  const m = /^(.*?)(\s*)(on)(\s+)(bar)(\s+)(\S+)(?:(\s+)(to)(\s+)(\S+))?(\s*)$/.exec(text)
  if (!m || (!m[1] && !/^\s/.test(text))) return null
  return [
    ...(m[1] ? read(m[1]) : []),
    part(null, m[2]),
    part("tk-directive-key", m[3]),
    part(null, m[4]),
    part("tk-directive-key", m[5]),
    part(null, m[6]),
    part("tk-directive-val", m[7]),
    ...(m[9]
      ? [
          part(null, m[8]),
          part("tk-directive-key", m[9]),
          part(null, m[10]),
          part("tk-directive-val", m[11]),
        ]
      : []),
    part(null, m[12]),
  ]
}

// What can follow play, or sit inside braces: an instrument's line, or names to play.
function playable(text: string, st?: Stand): Part[] {
  const placed = placement(text, (before) => playable(before, st))
  if (placed) return placed
  // every 3 steps { ... }: how long a step lasts, then what plays at that pace
  const pace = /^(every)(\s+)([^\s{]+)(\s*)([A-Za-z]*)(\s*)(.*)$/.exec(text)
  if (pace) {
    const [, word, a, n, b, unit, c, rest] = pace
    return [
      part("tk-directive-key", word),
      part(null, a),
      part(/^[\d(]/.test(n) ? "tk-directive-val" : "tk-error", n),
      part(null, b),
      part(unit === "beats" ? "tk-directive-key" : "tk-error", unit),
      part(null, c),
      // its braces are a pattern, with a length in front of them or not
      ...(rest.startsWith("{")
        ? braces(rest)
        : rest
          ? playable(rest, st && { ...st, value: false })
          : []),
    ]
  }
  const track = /^([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)?)(\s*)(:)(.*)$/.exec(text)
  if (track) {
    const name = track[1].toLowerCase()
    const known = PARTS.includes(name)
    const kind: Kind = among(PITCHED, name) ? "pitched" : "drum"
    return [
      part(known ? "tk-inst" : "tk-error", track[1]),
      part(null, track[2]),
      part("tk-punct", ":"),
      ...values(track[4], kind),
    ]
  }
  return names(text, st)
}

// { ... } on one line: the brace, what's inside, the closing brace and anything after.
// `st` is where the line stands (see names): a block is a thing of its own.
function braces(text: string, st: Stand = { depth: 0, took: false }, untyped = false): Part[] {
  const extra = st.depth === 0 && st.took
  if (st.depth === 0) st.took = true
  const out = [part(extra || untyped ? "tk-error" : "tk-punct", "{")]
  const inner = text.slice(1)
  let close = -1
  for (let i = 0, depth = 0; i < inner.length && close < 0; i++) {
    if (inner[i] === "{") depth++
    else if (inner[i] === "}" && depth-- === 0) close = i
  }
  if (close < 0) return out.concat(inner.trim() ? line(inner, 0, true) : [part(null, inner)])
  const body = inner.slice(0, close)
  out.push(...(body.trim() ? line(body, 0, true) : [part(null, body)]), part("tk-punct", "}"))
  // ({ ... } outro): what follows a block on its line, in a group or as a mistake
  out.push(...names(inner.slice(close + 1), st))
  return out
}

// A setting after set or with: tempo 90, time 7 over 8, key E, mode minor, swing on, or
// guitar.electric muted (an instrument and its sound). `bare` marks one written without set.
function setting(text: string, bare = false): Part[] {
  const word = /^[A-Za-z][A-Za-z0-9.]*/.exec(text)?.[0] || ""
  const after = text.slice(word.length)
  const name = part(bare ? "tk-error" : "tk-directive-key", word)
  const sound = soundsOf(word) && /^(\s+)([a-z]+)(\s*)$/.exec(after)
  if (sound) {
    const ok = soundsOf(word)!.includes(sound[2])
    return [
      name,
      part(null, sound[1]),
      part(ok ? "tk-directive-val" : "tk-error", sound[2]),
      part(null, sound[3]),
    ]
  }
  if ((word === "key" || word === "mode" || word === "swing") && /^\s/.test(after)) {
    // a key is a note, a mode one of the modes, and swing on or off
    const m = /^(\s+)([\s\S]*?)(\s*)$/.exec(after)!
    const ok =
      word === "key" ? parseKey(m[2]) : word === "mode" ? modeNamed(m[2]) : among(SWING, m[2])
    return [
      name,
      part(null, m[1]),
      part(ok ? "tk-directive-val" : "tk-error", m[2]),
      part(null, m[3]),
    ]
  }
  if (among(SETTINGS, word)) {
    return [
      name,
      ...pieces(after, /(\s+)/).map((p) =>
        /^\s+$/.test(p)
          ? part(null, p)
          : part(
              p === "over"
                ? "tk-directive-key"
                : p === "=" || p === ":"
                  ? "tk-error"
                  : "tk-directive-val",
              p,
            ),
      ),
    ]
  }
  return text ? [part("tk-error", text)] : []
}

// What follows with: its settings, with commas between them, then its block.
function withHead(text: string, st: Stand): Part[] {
  const brace = text.indexOf("{")
  const head = brace < 0 ? text : text.slice(0, brace)
  const out: Part[] = []
  for (const p of pieces(head, /(,)/)) {
    if (p === ",") {
      out.push(part("tk-punct", p))
      continue
    }
    const lead = /^\s*/.exec(p)![0]
    const body = p.slice(lead.length).replace(/\s+$/, "")
    out.push(
      part(null, lead),
      ...(body ? setting(body) : []),
      part(null, p.slice(lead.length + body.length)),
    )
  }
  return brace < 0 ? out : [...out, ...braces(text.slice(brace), st)]
}

// Color each comma-delimited entry using the lexer's brace and parenthesis rules.
function entries(
  code: string,
  render: (entry: string) => Part[],
  inside: boolean,
  onlySplit = false,
): Part[] {
  const out: Part[] = []
  let nesting = 0
  let at = 0
  let start = 0
  for (const token of Lexer.tokens(code, inside)) {
    if (token.kind === "open") nesting++
    else if (token.kind === "close") nesting--
    else if (token.kind === "separator" && nesting === 0) {
      const entry = code.slice(start, at)
      out.push(
        ...render(entry),
        part(inside && entry.trim() && token.text === "," ? "tk-punct" : "tk-error", token.text),
      )
      start = at + token.text.length
    }
    at += token.text.length
  }
  return out.length || !onlySplit ? [...out, ...render(code.slice(start))] : []
}

// One line of code, without its comment. `depth` is how many groups ( ) are open where it
// starts, from the lines above, and `inside` whether it's inside braces, where a setting
// goes on a with rather than after set.
function line(code: string, depth = 0, inside = false): Part[] {
  // Read each entry separately, including one-line blocks and nested blocks.
  const separated = entries(code, (entry) => line(entry, depth, inside), inside, true)
  if (separated.length) return separated
  const placed = placement(code, (before) => line(before, depth, inside))
  if (placed) return placed
  const st = { depth, took: false }
  const lead = /^\s*/.exec(code)![0]
  const body = code.slice(lead.length)
  const out = lead ? [part(null, lead)] : []
  if (!body) return out
  const word = /^[A-Za-z][A-Za-z0-9]*/.exec(body)?.[0] || ""
  const after = body.slice(word.length)
  // A play's output length follows its music, including a closing } or ) on a later line.
  if (word === "play" || /^[})]/.test(body)) {
    let level = depth
    let blocks = 0
    for (let i = 0; i < code.length; i++) {
      if (code[i] === "(") level++
      else if (code[i] === ")") level--
      else if (code[i] === "{") blocks++
      else if (code[i] === "}") blocks = Math.max(0, blocks - 1)
      if (
        level !== 0 ||
        blocks !== 0 ||
        !/^for\b/.test(code.slice(i)) ||
        (i > 0 && !/\s/.test(code[i - 1]))
      )
        continue
      const before = code.slice(0, i)
      const gap = /\s*$/.exec(before)?.[0] ?? ""
      const afterFor = code.slice(i + 3)
      const space = /^\s*/.exec(afterFor)?.[0] ?? ""
      const duration = length(afterFor.slice(space.length))
      return [
        ...line(before.slice(0, before.length - gap.length), depth, inside),
        part(null, gap),
        part("tk-directive-key", "for"),
        part(null, space),
        ...duration.parts,
        ...(duration.rest ? [part("tk-directive-val", duration.rest)] : []),
      ]
    }
  }

  let soundSetting = /^([a-z.]+)(\s+)([a-z]+)(\s*)$/.exec(body)
  if (soundSetting && !soundsOf(soundSetting[1])) soundSetting = null
  const typed = among(TYPES, word) && /^(\s+)([A-Za-z][A-Za-z0-9]*)(\s*)(=)(\s*)(.*)$/.exec(after)
  if (body.startsWith("}")) {
    // } chorus): what follows a block that closes here, in a group or as a mistake
    out.push(part("tk-punct", "}"), ...names(body.slice(1), { depth, took: depth === 0 }))
  } else if (typed) {
    // steps pair = ^-x-, chords verse = Am F, pattern groove = 3 bars { ... }: the type,
    // the name, and a value of that type
    const [, gap, name, before, , afterEq, value] = typed
    // taken, or not a name: Bridge, a single letter, a numeral
    const taken =
      among(SETTINGS, name) ||
      PARTS.includes(name) ||
      KEYWORDS.includes(name) ||
      !OWN_NAME.test(name) ||
      isDegreeChord(name)
    out.push(part("tk-directive-key", word), part(null, gap))
    out.push(part(taken ? "tk-error" : "tk-word", name), part(null, before))
    out.push(part("tk-punct", "="), part(null, afterEq))
    if (word === "pattern" || word === "block") {
      const len = length(value)
      out.push(...len.parts, ...playable(len.rest, st))
    } else {
      const holds: Record<string, Kind> = { chords: "chord", notes: "notes" }
      out.push(...values(value, holds[word] || "drum"))
    }
  } else if (
    !inside &&
    !depth &&
    ["notes", "chords", "steps"].includes(word) &&
    /^\s+[^\s={]/.test(after) &&
    !/^\s+[A-Za-z][A-Za-z0-9]*\s*=/.test(after) &&
    !after.includes("{")
  ) {
    // chords 1/3 C/E on a line of its own: a value, read as it is after an instrument
    const gap = /^\s*/.exec(after)![0]
    out.push(part("tk-directive-key", word), part(null, gap))
    out.push(
      ...values(
        after.slice(gap.length),
        word === "chords" ? "chord" : word === "steps" ? "drum" : "notes",
      ),
    )
  } else if (!inside && !depth && intervalCall(body.trim())?.call) {
    // fifth(harmony) on a line of its own
    out.push(...values(body, "notes"))
  } else if (
    ["pattern", "block", "steps", "notes"].includes(word) &&
    /^(\s|$)/.test(after) &&
    !TYPED_BRACES_RE.test(body)
  ) {
    // pattern groove {: a type without its name and =
    out.push(part("tk-error", word), ...names(after, st))
  } else if ((word === "bar" || word === "bars") && /^\s+\S/.test(after)) {
    // bar 2 { ... }, bar 2 hat.pedal: 4, bar 3 to 4 fill: a place, then what plays there.
    // bars is only ever a length, so it's a mistake here.
    const m = /^(\s+)([^\s{]+)(?:(\s+)(to)(\s+)([^\s{]+))?(\s*)([\s\S]*)$/.exec(after)
    if (!m) {
      // bar { ... }: the number is missing, as it is while it's being typed. The parser says
      // so, and what follows is read as it would be after a bar.
      const space = /^\s*/.exec(after)![0]
      out.push(part("tk-error", word), part(null, space), ...braces(after.slice(space.length)))
    } else {
      out.push(part("tk-error", word), part(null, m[1]))
      out.push(part("tk-directive-val", m[2]))
      if (m[4]) {
        out.push(part(null, m[3]), part("tk-directive-key", m[4]), part(null, m[5]))
        out.push(part("tk-directive-val", m[6]))
      }
      out.push(part(null, m[7]))
      if (m[8].startsWith("{")) out.push(...braces(m[8]))
      else if (m[8]) out.push(...playable(m[8]))
    }
  } else if (word === "print" && /^(\s|\(|$)/.test(after)) {
    const gap = /^\s*/.exec(after)![0]
    const call = after.slice(gap.length)
    out.push(part("tk-directive-key", word), part(null, gap))
    if (!call.startsWith("(")) return [...out, part("tk-error", call)]
    let depth = 1
    let end = 1
    for (; end < call.length && depth; end++) {
      if (call[end] === "(") depth++
      else if (call[end] === ")") depth--
    }
    out.push(part(depth ? "tk-error" : "tk-punct", "("))
    const args = splitOutside(call.slice(1, depth ? end : end - 1), ",")
    args.forEach((arg, i) => {
      if (i) out.push(part("tk-punct", ","))
      const typed = /^(\s*)(notes|chords|steps)(\s+|$)/.exec(arg)
      if (typed) {
        out.push(part(null, typed[1]), part("tk-directive-key", typed[2]), part(null, typed[3]))
        out.push(
          ...values(
            arg.slice(typed[0].length),
            typed[2] === "chords" ? "chord" : typed[2] === "steps" ? "drum" : "notes",
          ),
        )
      } else {
        const chord = /(?:[A-G][#b]?|\d+)(?:maj|min|sus|dim|dom|aug|add|m|M)/.test(arg)
        out.push(...values(arg, chord ? "chord" : "notes"))
      }
    })
    if (!depth) out.push(part("tk-punct", ")"))
    if (call.slice(end)) out.push(part(call.slice(end).trim() ? "tk-error" : null, call.slice(end)))
  } else if (word === "play" && /^(\s|$)/.test(after)) {
    // play groove, play block { ... } for 3 bars, play kick: x--x
    const space = /^\s*/.exec(after)![0]
    out.push(part("tk-directive-key", word), part(null, space))
    const len = length(after.slice(space.length))
    out.push(...len.parts.map((token) => (token.c ? { ...token, c: "tk-error" } : token)))
    // braces say their type here too: play { ... } is a mistake
    if (len.rest.startsWith("{")) out.push(...braces(len.rest, st, true))
    else if (len.rest) out.push(...playable(len.rest, st))
  } else if (word === "set" && /^(\s|$)/.test(after)) {
    // set tempo 90, set key E, set guitar.electric muted: set, then a setting. Only at the top
    const space = /^\s*/.exec(after)![0]
    out.push(
      part(inside ? "tk-error" : "tk-directive-key", word),
      part(null, space),
      ...setting(after.slice(space.length)),
    )
  } else if (word === "with" && /^(\s|\{|$)/.test(after)) {
    // with key E, mode minor { ... }: settings for its block only
    out.push(part("tk-directive-key", word), ...withHead(after, st))
  } else if (soundSetting || (among(SETTINGS, word) && /^\s/.test(after))) {
    // tempo 90 with no set in front: a mistake, which the parser explains
    out.push(...setting(body, true))
  } else if (word && /^\s*=/.test(after)) {
    // verse = Am E7|G D: a name without its type in front
    const m = /^(\s*)(=)(\s*)([\s\S]*)$/.exec(after)!
    out.push(part("tk-error", word), part(null, m[1]), part("tk-punct", "="))
    out.push(part(null, m[3]))
    const len = length(m[4])
    const block = len.parts.length || m[4].includes("{") || TRACK_RE.test(m[4])
    out.push(...(block ? [...len.parts, ...playable(len.rest, st)] : values(m[4], "word")))
  } else out.push(...playable(body, { ...st, value: true }))
  return out
}

// A line in an instrument's block: one layer, of a drum's steps or of what a pitched
// instrument plays.
function layerLine(code: string, holds: "steps" | "pitched"): Part[] {
  const lead = /^\s*/.exec(code)![0]
  return [part(null, lead), ...values(code.slice(lead.length), holds === "steps" ? "drum" : holds)]
}

// What a { holds, from the text in front of it on its line: a drum's steps after kick: or
// steps name =, a pitched instrument's layers after piano:, and the same inside another
// block of them; otherwise lines.
function opens(before: string, outer: Holds | undefined): Holds {
  if (outer === "steps" || outer === "pitched") return outer
  const track = /([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)?)\s*:[^:{}]*$/.exec(before)
  if (track) {
    const name = track[1].toLowerCase()
    return LANES.includes(name) ? "steps" : among(PITCHED, name) ? "pitched" : "lines"
  }
  return /^\s*steps\s+[A-Za-z][A-Za-z0-9]*\s*=[^{}]*$/.test(before) ? "steps" : "lines"
}

function renderMusic(src: string): Part[][] {
  const open: Holds[] = [] // what each block still open holds
  let groups = 0 // how many groups ( ) are open, from the lines above
  let continues: Kind | null = null // what a line that starts with | goes on with
  return src.split("\n").map((raw) => {
    // A line break may be \r\n. The parser trims it, so it's set aside here, and kept.
    const text = raw.endsWith("\r") ? raw.slice(0, -1) : raw
    const cut = text.indexOf("//")
    const code = cut < 0 ? text : text.slice(0, cut)
    const holds = open[open.length - 1]
    const lead = /^\s*/.exec(code)![0]
    let parts: Part[]
    lastKind = null
    if (code.slice(lead.length).startsWith("|") && continues) {
      // |C G: the line above goes on, so it's coloured as that line's value
      parts = [part(null, lead), ...values(code.slice(lead.length), continues)]
    } else if ((holds === "steps" || holds === "pitched") && !/^\s*}/.test(code))
      parts = layerLine(code, holds)
    else parts = line(code, groups, open.length > 0)
    if (code.trim()) continues = lastKind
    else if (!text.trim()) continues = null
    for (let i = 0; i < code.length; i++) {
      if (code[i] === "{") open.push(opens(code.slice(0, i), open[open.length - 1]))
      else if (code[i] === "}") open.pop()
      else if (code[i] === "(") groups++
      else if (code[i] === ")") groups = Math.max(0, groups - 1)
    }
    if (cut >= 0) parts.push(part("tk-comment", text.slice(cut)))
    if (text !== raw) parts.push(part(null, "\r"))
    return parts.filter((p) => p.s !== "")
  })
}

// Newlines in braces are layout. Highlight each complete brace entry, then project its
// classes back onto the untouched source so wrapping and comments keep exact offsets.
export function highlightMusic(src: string): Part[][] {
  const comments: { from: number; to: number }[] = []
  let offset = 0
  let braces = 0
  let parens = 0
  const normalized = Lexer.tokens(src)
    .map((token) => {
      const from = offset
      offset += token.text.length
      if (token.kind === "open") braces++
      else if (token.kind === "close") braces = Math.max(0, braces - 1)
      if (token.kind === "text") {
        for (const c of token.text) {
          if (c === "(") parens++
          else if (c === ")") parens = Math.max(0, parens - 1)
        }
      }
      if (token.kind === "comment") {
        comments.push({ from, to: offset - (token.text.endsWith("\r") ? 1 : 0) })
        return token.text.replace(/[^\r\n]/g, " ")
      }
      return (braces || parens) && token.kind === "join"
        ? token.text.replace(/\n/g, " ")
        : token.text
    })
    .join("")
  const painted = renderMusic(normalized).flatMap((line, index) =>
    index ? [part(null, "\n"), ...line] : line,
  )
  const lines: Part[][] = [[]]
  offset = 0
  let comment = 0
  for (const piece of painted) {
    const until = offset + piece.s.length
    while (offset < until) {
      while (comment < comments.length && comments[comment].to <= offset) comment++
      if (src[offset] === "\n") {
        lines.push([])
        offset++
        continue
      }
      const marked = comments[comment]
      const inside = marked && marked.from <= offset
      const newline = src.indexOf("\n", offset)
      const end = Math.min(
        until,
        newline < 0 ? src.length : newline,
        marked ? (inside ? marked.to : marked.from) : src.length,
      )
      lines[lines.length - 1].push(part(inside ? "tk-comment" : piece.c, src.slice(offset, end)))
      offset = end
    }
  }
  return lines
}
