/* Syntax highlighter for music cells (see language.js).
   Exposes highlightMusic(src) -> lines of token parts for React rendering.
   Each part: { c: className | null, s: text }
   Token classes (used by CSS):
     .tk-comment, .tk-directive-key (keywords and settings), .tk-directive-val,
     .tk-inst, .tk-word (your own names), .tk-punct, .tk-bar, .tk-root, .tk-quality,
     .tk-ext, .tk-rest, .tk-slash, .tk-bass, .tk-beat, .tk-mod, .tk-step, .tk-step-acc,
     .tk-error
   Whitespace is kept exactly, so the layer lines up with the textarea under it. */
import { KEYWORDS, LANES, MODIFIERS, PARTS, SETTINGS, TYPES } from "./language.js"
import { isRoman } from "./chords.js"

const ROMAN_RE = /^([#b])?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)([°oø]?)(.*)$/
const STEPS_RE = /^[-xXgdD]+$/
const NAME_RE = /^[A-Za-z][A-Za-z0-9]*$/
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
    if (rm[3]) parts.push(part("tk-quality", rm[3]))
    rest = rm[4] || ""
  } else {
    const am = /^([A-G][b#]?)(.*)$/.exec(core)
    if (!am) return [part("tk-error", token)]
    parts.push(part("tk-root tk-root-abs", am[1]))
    rest = am[2] || ""
  }
  let i = 0
  while (i < rest.length) {
    const r = rest.slice(i)
    const q = /^(maj|min|sus2|sus4|sus|dim|aug|m|M|°|o|\+|ø|Δ)/.exec(r)
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

// x--X-g-: each step coloured on its own.
function stepRun(t) {
  return [...t].map((ch) =>
    ch === "-"
      ? part("tk-rest", ch)
      : part(ch === ch.toUpperCase() ? "tk-step tk-step-acc" : "tk-step", ch),
  )
}

// One token of what an instrument plays (or of what a steps or chords name holds).
function valueToken(t, kind) {
  if (t === "|" || t === "%") return [part("tk-bar", t)]
  if (t === "{" || t === "}") return [part("tk-punct", t)] // a drum's block of steps
  // loop is gone: whether something repeats depends on where it is
  if (t === "loop") return [part("tk-error", t)]
  if (t === "-" || t === "_") return [part("tk-rest", t)]
  if (kind !== "chord") {
    if (STEPS_RE.test(t)) return stepRun(t)
    if (/^\d+(e|&|a)?$/.test(t)) return [part("tk-beat", t)]
    if (MODIFIERS.includes(t)) return [part("tk-mod", t)]
  }
  if (/^[a-z][a-z0-9]+$/.test(t) && !isRoman(t)) return [part("tk-word", t)]
  if (kind === "drum") return [part("tk-error", t)]
  return chordToken(t)
}

// Splits text into tokens and the whitespace between them, keeping both.
function pieces(text, re) {
  return text.split(re).filter((p) => p !== "")
}

function values(text, kind) {
  return pieces(text, /(\s+|\||[{}])/).flatMap((p) =>
    /^\s+$/.test(p) ? [part(null, p)] : valueToken(p, kind),
  )
}

// intro verse, 6 bars (verse chorus), groove { snare: xxxx }: patterns' names, lengths
// and patterns without a name.
function names(text) {
  const open = text.indexOf("{")
  if (open >= 0) return [...names(text.slice(0, open)), ...braces(text.slice(open))]
  let number = false // whether the last thing was a number, which * can multiply
  return pieces(text, /(\s+|[()*{}])/).map((p) => {
    if (/^\s+$/.test(p)) return part(null, p)
    const wasNumber = number
    number = /^[\d./+-]+$/.test(p) || (number && p === "*")
    // * only does arithmetic: 2*3 bars. After a name it used to repeat; a length in front
    // does that now, and loop is gone.
    if (p === "*") return part(wasNumber ? "tk-punct" : "tk-error", p)
    if ("(){}".includes(p)) return part("tk-punct", p)
    if (p === "loop") return part("tk-error", p)
    if (p === "bars" || p === "bar") return part("tk-directive-key", p)
    if (number) return part("tk-directive-val", p)
    return part(NAME_RE.test(p) ? "tk-word" : "tk-error", p)
  })
}

// A length in front of something: "3 bars " → its parts, and what's left.
function length(text) {
  const m = /^(\S+)(\s+)(bars?)(\s*)(?![A-Za-z0-9])/.exec(text)
  if (!m || !/^[\d(]/.test(m[1])) return { parts: [], rest: text }
  return {
    parts: [
      part("tk-directive-val", m[1]),
      part(null, m[2]),
      part("tk-directive-key", m[3]),
      part(null, m[4]),
    ],
    rest: text.slice(m[0].length),
  }
}

// What can follow play, or sit inside braces: an instrument's line, or names to play.
function playable(text) {
  const track = /^([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)?)(\s*)(:)(.*)$/.exec(text)
  if (track) {
    const name = track[1].toLowerCase()
    const known = PARTS.includes(name)
    return [
      part(known ? "tk-inst" : "tk-error", track[1]),
      part(null, track[2]),
      part("tk-punct", ":"),
      ...values(track[4], name === "chords" ? "chord" : "drum"),
    ]
  }
  return names(text)
}

// { ... } on one line: the brace, what's inside, the closing brace and anything after.
function braces(text) {
  const out = [part("tk-punct", "{")]
  const inner = text.slice(1)
  let close = -1
  for (let i = 0, depth = 0; i < inner.length && close < 0; i++) {
    if (inner[i] === "{") depth++
    else if (inner[i] === "}" && depth-- === 0) close = i
  }
  if (close < 0) return out.concat(inner.trim() ? line(inner) : [part(null, inner)])
  const body = inner.slice(0, close)
  out.push(...(body.trim() ? line(body) : [part(null, body)]), part("tk-punct", "}"))
  // { ... } outro: what follows a block is more to play in a row
  out.push(...names(inner.slice(close + 1)))
  return out
}

// One line of code, without its comment.
function line(code) {
  const lead = /^\s*/.exec(code)[0]
  const body = code.slice(lead.length)
  const out = lead ? [part(null, lead)] : []
  if (!body) return out
  const word = /^[A-Za-z][A-Za-z0-9]*/.exec(body)?.[0] || ""
  const after = body.slice(word.length)

  const typed = TYPES.includes(word) && /^(\s+)([A-Za-z][A-Za-z0-9]*)(\s*)(=)(\s*)(.*)$/.exec(after)
  if (body.startsWith("}")) {
    // } outro: what follows a block is more to play in a row
    out.push(part("tk-punct", "}"), ...names(body.slice(1)))
  } else if (typed) {
    // steps pair = X-x-, chords verse = Am F, pattern groove = 3 bars { ... }: the type,
    // the name, and a value of that type
    const [, gap, name, before, , afterEq, value] = typed
    const taken = SETTINGS.includes(name) || PARTS.includes(name) || KEYWORDS.includes(name)
    out.push(part("tk-directive-key", word), part(null, gap))
    out.push(part(taken ? "tk-error" : "tk-word", name), part(null, before))
    out.push(part("tk-punct", "="), part(null, afterEq))
    if (word === "pattern") {
      const len = length(value)
      out.push(...len.parts, ...playable(len.rest))
    } else out.push(...values(value, word === "chords" ? "chord" : "drum"))
  } else if ((word === "pattern" || word === "steps") && /^(\s|$)/.test(after)) {
    // pattern groove {: a type without its name and =
    out.push(part("tk-error", word), ...names(after))
  } else if (word === "play" && /^(\s|$)/.test(after)) {
    // play groove, play 3 bars { ... }, play kick: x--x
    const space = /^\s*/.exec(after)[0]
    out.push(part("tk-directive-key", word), part(null, space))
    const len = length(after.slice(space.length))
    out.push(...len.parts)
    if (len.rest.startsWith("{")) out.push(...braces(len.rest))
    else if (len.rest) out.push(...playable(len.rest))
  } else if (SETTINGS.includes(word) && /^\s/.test(after)) {
    // tempo 90, time 7 over 8
    out.push(part("tk-directive-key", word))
    for (const p of pieces(after, /(\s+)/)) {
      out.push(
        /^\s+$/.test(p)
          ? part(null, p)
          : part(
              p === "over" ? "tk-directive-key" : p === "=" || p === ":" ? "tk-error" : "tk-directive-val",
              p,
            ),
      )
    }
  } else if (word && /^\s*=/.test(after)) {
    // verse = Am E7|G D: a name without its type in front
    const m = /^(\s*)(=)(\s*)(.*)$/.exec(after)
    out.push(part("tk-error", word), part(null, m[1]), part("tk-punct", "="))
    out.push(part(null, m[3]))
    const len = length(m[4])
    const block = len.parts.length || m[4].includes("{") || TRACK_RE.test(m[4])
    out.push(...(block ? [...len.parts, ...playable(len.rest)] : values(m[4], "word")))
  } else out.push(...playable(body))
  return out
}

// A line in a drum's block of steps: one layer.
function layerLine(code) {
  const lead = /^\s*/.exec(code)[0]
  return [part(null, lead), ...values(code.slice(lead.length), "drum")]
}

// What a { holds, from the text in front of it on its line: a drum's steps after kick: or
// steps name =, and inside another block of steps; otherwise lines.
function opens(before, outer) {
  if (outer === "steps") return "steps"
  const track = /([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)?)\s*:[^:{}]*$/.exec(before)
  if (track) return LANES.includes(track[1].toLowerCase()) ? "steps" : "lines"
  return /^\s*steps\s+[A-Za-z][A-Za-z0-9]*\s*=[^{}]*$/.test(before) ? "steps" : "lines"
}

export function highlightMusic(src) {
  const open = [] // what each block still open holds
  return src.split("\n").map((text) => {
    const cut = text.indexOf("//")
    const code = cut < 0 ? text : text.slice(0, cut)
    const parts = open[open.length - 1] === "steps" ? layerLine(code) : line(code)
    for (let i = 0; i < code.length; i++) {
      if (code[i] === "{") open.push(opens(code.slice(0, i), open[open.length - 1]))
      else if (code[i] === "}") open.pop()
    }
    if (cut >= 0) parts.push(part("tk-comment", text.slice(cut)))
    return parts.filter((p) => p.s !== "")
  })
}
