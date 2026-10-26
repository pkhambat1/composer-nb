/* Syntax highlighter for music cells (see language.js).
   Exposes highlightMusic(src) -> lines of token parts for React rendering.
   Each part: { c: className | null, s: text }
   Token classes (used by CSS):
     .tk-comment, .tk-directive-key (keywords and settings), .tk-directive-val,
     .tk-inst, .tk-word (your own names), .tk-punct, .tk-bar, .tk-root, .tk-quality,
     .tk-ext, .tk-rest, .tk-slash, .tk-bass, .tk-beat, .tk-step, .tk-step-acc,
     .tk-note (a note on a pitched line),
     .tk-error
   Whitespace is kept exactly, so the layer lines up with the textarea under it. */
import { KEYWORDS, LANES, PARTS, PITCHED, SETTINGS, SOUNDS, TYPES, UNITS } from "./language.js"
import { isRoman, parseKey } from "./chords.js"

const ROMAN_RE = /^([#b])?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/
const STEPS_RE = /^[-x^~d]+$/
// A beat, with how it's hit in front when that isn't a plain hit: 4, 2e, ^4, ~3a, d3&
const BEAT_RE = /^[\^~d]?\d+(e|&|a)?$/
// Notes drawn on steps: E---F# E-E--, with # or b, an octave, and ^ or ~ in front; or
// degrees of the key, 1 to 7, with b or # in front and ' for each octave: 1---b3---5'---
const NOTE = "[\\^~]?(?:[A-G][#b]?[0-8]?|'*[#b]?[1-7]'*)"
const NOTES_RE = new RegExp(`^(?:-|_|${NOTE})+$`)
const NOTE_AT = new RegExp(`-|_|${NOTE}`, "g")
const NAME_RE = /^[A-Za-z][A-Za-z0-9]*$/
// What a length's arithmetic is made of: (1+2)*2 bars
const SUM_RE = /^[\d\s./+*()-]*\d[\d\s./+*()-]*$/
const TRACK_RE = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)?\s*:/

const part = (c, s) => ({ c, s })

function chordToken(token) {
  const parts = []
  let core = token
  let tail = []
  if (core.includes("/")) {
    const [main, bass] = core.split("/")
    core = main
    tail = [part("tk-slash", "/"), part("tk-bass", bass)]
  }
  let rest = ""
  const rm = ROMAN_RE.exec(core)
  if (rm) {
    const lower = rm[2] === rm[2].toLowerCase()
    parts.push(part("tk-root " + (lower ? "tk-root-min" : "tk-root-maj"), (rm[1] || "") + rm[2]))
    rest = rm[3] || ""
  } else {
    const am = /^([A-G][b#]?)(.*)$/.exec(core)
    if (!am) return [part("tk-error", token)]
    parts.push(part("tk-root tk-root-abs", am[1]))
    rest = am[2] || ""
  }
  let i = 0
  while (i < rest.length) {
    const r = rest.slice(i)
    const q = /^(maj|min|sus2|sus4|sus|dim|aug|m|M|\+)/.exec(r)
    const e = q ? null : /^(add9|b5|#5|b9|#9|#11|b13|13|11|9|7|6|2|4)/.exec(r)
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
function stepRun(t) {
  return [...t].map((ch) =>
    ch === "-" ? part("tk-rest", ch) : part(ch === "^" ? "tk-step tk-step-acc" : "tk-step", ch),
  )
}

// F---G~F-^E2, 1---b3---: each note coloured as the step it is, with its mark and octave.
// A note straight after another one is a mistake: notes don't touch.
function noteRun(t) {
  let afterNote = false
  return t.match(NOTE_AT).map((n) => {
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
function valueToken(t, kind) {
  if (t === "|" || t === "%") return [part("tk-bar", t)]
  if (t === "{" || t === "}") return [part("tk-punct", t)] // an instrument's block of layers
  // loop is gone: whether something repeats depends on where it is
  if (t === "loop") return [part("tk-error", t)]
  if (kind === "sticking") {
    // RLRR LRLL: a hand for each step
    if (/^[RL-]+$/.test(t)) {
      return [...t].map((ch) => (ch === "-" ? part("tk-rest", ch) : part("tk-step", ch)))
    }
    return [part(/^[a-z][a-z0-9]+$/.test(t) ? "tk-word" : "tk-error", t)]
  }
  if (kind === "notes") {
    if (NOTES_RE.test(t)) return noteRun(t)
    const name = /^[a-z][a-z0-9]+$/.test(t) && !isRoman(t) && !TYPES.includes(t)
    return [part(name ? "tk-word" : "tk-error", t)]
  }
  if (t === "-" || t === "_" || t === "rest") return [part("tk-rest", t)]
  if (kind !== "chord") {
    if (STEPS_RE.test(t)) return stepRun(t)
    if (BEAT_RE.test(t)) return [part("tk-beat", t)]
  }
  if (/^[a-z][a-z0-9]+$/.test(t) && !isRoman(t)) return [part("tk-word", t)]
  if (kind === "drum") return [part("tk-error", t)]
  return chordToken(t)
}

// Splits text into tokens and the whitespace between them, keeping both.
function pieces(text, re) {
  return text.split(re).filter((p) => p !== "")
}

// A block is the whole of what a kit piece's line, a layer or a steps name holds, so
// anything beside one is a mistake: kick: x--- { x- }. Which of the line's `words` are
// beside a block: the second thing on the line and after it, a block or a run of steps,
// once there's a block among them.
function beside(words) {
  const marked = new Set()
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
let lastKind = null

// A number written as a length's count: 2, 1.5, (1+2).
const isCount = (w) => /^[\d(][\d.()+*/-]*$/.test(w || "")

// `kind` is what the value is: a drum's steps ("drum"), notes, a chart of chords ("chord"),
// what a pitched instrument's line holds ("pitched": notes, or chords and then a chart),
// or anything a name could hold ("word").
function values(text, kind) {
  const all = pieces(text, /(\s+|\||[{},])/)
  const words = all.filter((p) => !/^\s+$/.test(p))
  // piano: chords Am F|C G: the word, then the chart
  const chart = kind === "pitched" && words[0] === "chords"
  if (kind === "pitched") kind = chart ? "chord" : "notes"
  lastKind = kind
  const mistakes = kind === "drum" ? beside(words) : new Set()
  const timed = kind === "drum" || kind === "notes" // lines that take lengths and ...
  let k = -1 // which word this is
  return all.flatMap((p) => {
    if (/^\s+$/.test(p)) return [part(null, p)]
    k++
    if (mistakes.has(k)) return [part("tk-error", p)]
    if (chart && k === 0) return [part("tk-directive-key", p)]
    if (p === ",") return [part("tk-punct", p)]
    if (timed) {
      // ...rest, ...x-, ...G1: the rest of the block, then what fills it
      if (p.startsWith("...")) {
        const thing = p.slice(3)
        if (thing === "rest") return [part("tk-directive-key", "..."), part("tk-rest", thing)]
        return [part("tk-directive-key", "..."), ...(thing ? valueToken(thing, kind) : [])]
      }
      // 3 in 8: hits spread over steps
      if (kind === "drum" && p === "in") return [part("tk-directive-key", p)]
      if (kind === "drum" && /^\d+$/.test(p) && (words[k + 1] === "in" || words[k - 1] === "in")) {
        return [part("tk-directive-val", p)]
      }
      // 2 beats rest, 3 beats C2: a length in front of what fills it
      if (UNITS.includes(p)) return [part("tk-directive-key", p)]
      if (isCount(p) && UNITS.includes(words[k + 1])) return [part("tk-directive-val", p)]
      // after a length's count only its unit can follow: 2 beatz, 2 pair
      if (kind === "drum" && isCount(words[k - 1]) && !/^[\d(,|{}]/.test(p) && !BEAT_RE.test(p)) {
        return [part("tk-error", p)]
      }
      if (p === "rest") return [part("tk-rest", p)]
      // always plural, so bar only ever says which bar
      if (["bar", "beat", "step"].includes(p)) return [part("tk-error", p)]
    }
    return valueToken(p, kind)
  })
}

// Whether the ( at `at` holds a length's arithmetic, (1+2) bars, and not a group of names.
function sum(text, at) {
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
// group that runs over several lines starts its later lines inside it.
function names(text, st = { depth: 0, took: false }) {
  const out = []
  const open = [] // each ( still open on this line: whether it holds a length's arithmetic
  let number = false // whether the last thing was a number, which * can multiply
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
    number = /^[\d./+-]+$/.test(p) || (number && p === "*")
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
      return [...out, ...braces(text.slice(here), st)]
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
function length(text) {
  const m = /^(\S+)(\s+)(bars?)(?![A-Za-z0-9])(\s*)/.exec(text)
  // A count's brackets close in it: ((1+2) bars a b) is a group that starts with a length
  const balanced = (n) => (n.match(/\(/g) || []).length === (n.match(/\)/g) || []).length
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

// What can follow play, or sit inside braces: an instrument's line, or names to play.
function playable(text, st) {
  // every 3 steps { ... }: how long a step lasts, then what plays at that pace
  const pace = /^(every)(\s+)([^\s{]+)(\s*)([A-Za-z]*)(\s*)(.*)$/.exec(text)
  if (pace) {
    const [, word, a, n, b, unit, c, rest] = pace
    return [
      part("tk-directive-key", word),
      part(null, a),
      part(/^[\d(]/.test(n) ? "tk-directive-val" : "tk-error", n),
      part(null, b),
      part(UNITS.includes(unit) ? "tk-directive-key" : "tk-error", unit),
      part(null, c),
      ...(rest.startsWith("{") ? braces(rest) : rest ? playable(rest, st) : []),
    ]
  }
  const track = /^([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)?)(\s*)(:)(.*)$/.exec(text)
  if (track) {
    const name = track[1].toLowerCase()
    const known = PARTS.includes(name) || name === "sticking"
    const kind = PITCHED.includes(name) ? "pitched" : name === "sticking" ? "sticking" : "drum"
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
function braces(text, st = { depth: 0, took: false }) {
  const extra = st.depth === 0 && st.took
  if (st.depth === 0) st.took = true
  const out = [part(extra ? "tk-error" : "tk-punct", "{")]
  const inner = text.slice(1)
  let close = -1
  for (let i = 0, depth = 0; i < inner.length && close < 0; i++) {
    if (inner[i] === "{") depth++
    else if (inner[i] === "}" && depth-- === 0) close = i
  }
  if (close < 0) return out.concat(inner.trim() ? line(inner) : [part(null, inner)])
  const body = inner.slice(0, close)
  out.push(...(body.trim() ? line(body) : [part(null, body)]), part("tk-punct", "}"))
  // ({ ... } outro): what follows a block on its line, in a group or as a mistake
  out.push(...names(inner.slice(close + 1), st))
  return out
}

// One line of code, without its comment. `depth` is how many groups ( ) are open where it
// starts, from the lines above.
function line(code, depth = 0) {
  const st = { depth, took: false }
  const lead = /^\s*/.exec(code)[0]
  const body = code.slice(lead.length)
  const out = lead ? [part(null, lead)] : []
  if (!body) return out
  const word = /^[A-Za-z][A-Za-z0-9]*/.exec(body)?.[0] || ""
  const after = body.slice(word.length)

  let soundSetting = /^([a-z.]+)(\s+)([a-z]+)(\s*)$/.exec(body)
  if (soundSetting && !SOUNDS[soundSetting[1]]) soundSetting = null
  const typed = TYPES.includes(word) && /^(\s+)([A-Za-z][A-Za-z0-9]*)(\s*)(=)(\s*)(.*)$/.exec(after)
  if (body.startsWith("}")) {
    // } chorus): what follows a block that closes here, in a group or as a mistake
    out.push(part("tk-punct", "}"), ...names(body.slice(1), { depth, took: depth === 0 }))
  } else if (typed) {
    // steps pair = ^-x-, chords verse = Am F, pattern groove = 3 bars { ... }: the type,
    // the name, and a value of that type
    const [, gap, name, before, , afterEq, value] = typed
    const taken = SETTINGS.includes(name) || PARTS.includes(name) || KEYWORDS.includes(name)
    out.push(part("tk-directive-key", word), part(null, gap))
    out.push(part(taken ? "tk-error" : "tk-word", name), part(null, before))
    out.push(part("tk-punct", "="), part(null, afterEq))
    if (word === "pattern") {
      const len = length(value)
      out.push(...len.parts, ...playable(len.rest, st))
    } else {
      out.push(...values(value, { chords: "chord", notes: "notes", sticking: "sticking" }[word] || "drum"))
    }
  } else if (["pattern", "steps", "sticking", "notes"].includes(word) && /^(\s|$)/.test(after)) {
    // pattern groove {: a type without its name and =
    out.push(part("tk-error", word), ...names(after, st))
  } else if ((word === "bar" || word === "bars") && /^\s+\S/.test(after)) {
    // bar 2 { ... }, bar 2 hat.pedal: 4, bar 3 to 4 fill: a place, then what plays there.
    // bars is only ever a length, so it's a mistake here.
    const m = /^(\s+)([^\s{]+)(?:(\s+)(to)(\s+)([^\s{]+))?(\s*)([\s\S]*)$/.exec(after)
    if (!m) {
      // bar { ... }: the number is missing, as it is while it's being typed. The parser says
      // so, and what follows is read as it would be after a bar.
      const space = /^\s*/.exec(after)[0]
      out.push(part("tk-error", word), part(null, space), ...braces(after.slice(space.length)))
    } else {
      out.push(part(word === "bar" ? "tk-directive-key" : "tk-error", word), part(null, m[1]))
      out.push(part("tk-directive-val", m[2]))
      if (m[4]) {
        out.push(part(null, m[3]), part("tk-directive-key", m[4]), part(null, m[5]))
        out.push(part("tk-directive-val", m[6]))
      }
      out.push(part(null, m[7]))
      if (m[8].startsWith("{")) out.push(...braces(m[8]))
      else if (m[8]) out.push(...playable(m[8]))
    }
  } else if (word === "play" && /^(\s|$)/.test(after)) {
    // play groove, play 3 bars { ... }, play kick: x--x
    const space = /^\s*/.exec(after)[0]
    out.push(part("tk-directive-key", word), part(null, space))
    const len = length(after.slice(space.length))
    out.push(...len.parts)
    if (len.rest.startsWith("{")) out.push(...braces(len.rest, st))
    else if (len.rest) out.push(...playable(len.rest, st))
  } else if (soundSetting) {
    // guitar.electric muted: an instrument and its sound, a setting like kit
    const [, inst, gap, sound, end] = soundSetting
    out.push(part("tk-directive-key", inst), part(null, gap))
    out.push(part(SOUNDS[inst].includes(sound) ? "tk-directive-val" : "tk-error", sound))
    out.push(part(null, end))
  } else if (word === "key" && /^\s/.test(after)) {
    // key Am, key D dorian: the key, as one value
    const m = /^(\s+)([\s\S]*?)(\s*)$/.exec(after)
    out.push(part("tk-directive-key", word), part(null, m[1]))
    out.push(part(parseKey(m[2]) ? "tk-directive-val" : "tk-error", m[2]), part(null, m[3]))
  } else if (SETTINGS.includes(word) && /^\s/.test(after)) {
    // tempo 90, time 7 over 8
    out.push(part("tk-directive-key", word))
    for (const p of pieces(after, /(\s+)/)) {
      out.push(
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
      )
    }
  } else if (word && /^\s*=/.test(after)) {
    // verse = Am E7|G D: a name without its type in front
    const m = /^(\s*)(=)(\s*)([\s\S]*)$/.exec(after)
    out.push(part("tk-error", word), part(null, m[1]), part("tk-punct", "="))
    out.push(part(null, m[3]))
    const len = length(m[4])
    const block = len.parts.length || m[4].includes("{") || TRACK_RE.test(m[4])
    out.push(...(block ? [...len.parts, ...playable(len.rest, st)] : values(m[4], "word")))
  } else out.push(...playable(body, st))
  return out
}

// A line in an instrument's block: one layer, of a drum's steps or of what a pitched
// instrument plays.
function layerLine(code, holds) {
  const lead = /^\s*/.exec(code)[0]
  return [part(null, lead), ...values(code.slice(lead.length), holds === "steps" ? "drum" : holds)]
}

// What a { holds, from the text in front of it on its line: a drum's steps after kick: or
// steps name =, a pitched instrument's layers after piano:, and the same inside another
// block of them; otherwise lines.
function opens(before, outer) {
  if (outer === "steps" || outer === "pitched") return outer
  const track = /([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)?)\s*:[^:{}]*$/.exec(before)
  if (track) {
    const name = track[1].toLowerCase()
    return LANES.includes(name) ? "steps" : PITCHED.includes(name) ? "pitched" : "lines"
  }
  return /^\s*steps\s+[A-Za-z][A-Za-z0-9]*\s*=[^{}]*$/.test(before) ? "steps" : "lines"
}

export function highlightMusic(src) {
  const open = [] // what each block still open holds
  let groups = 0 // how many groups ( ) are open, from the lines above
  let continues = null // what a line that starts with | goes on with
  return src.split("\n").map((raw) => {
    // A line break may be \r\n. The parser trims it, so it's set aside here, and kept.
    const text = raw.endsWith("\r") ? raw.slice(0, -1) : raw
    const cut = text.indexOf("//")
    const code = cut < 0 ? text : text.slice(0, cut)
    const holds = open[open.length - 1]
    const lead = /^\s*/.exec(code)[0]
    let parts
    lastKind = null
    if (code.slice(lead.length).startsWith("|") && continues) {
      // |C G: the line above goes on, so it's coloured as that line's value
      parts = [part(null, lead), ...values(code.slice(lead.length), continues)]
    } else if (holds === "steps" || holds === "pitched") parts = layerLine(code, holds)
    else parts = line(code, groups)
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
