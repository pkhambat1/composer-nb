/* The music-cell language. A cell is a script, read top to bottom. Every line starts by
   saying what it is:
     tempo 90              a setting: a reserved word and its value (time 7 over 8,
                           sound guitar, step 1/16). Settings aren't variables, so no =.
     verse = Am E7|G D     a variable: your own name for steps or chords. Only these get =.
     pattern groove { }    a pattern: a block, lines in braces that play together, with a
                           name. Never =.
     kick: x--x---         inside braces, an instrument and what it plays. The colon only
                           ever means this. One instrument per line: which sound is the
                           line, when is the steps. Lines play together, so two drums on
                           one step is two lines.
     play { }              plays what's after it, a block or one line (play groove * 2),
                           and gives one output with a player and a drum grid. Nothing
                           plays unless it's inside a play.
   Inside braces, a pattern's name on a line of its own plays it (intro (verse chorus) * 2
   plays in order, * repeats). A block without a name plays wherever a name could:
   intro { snare: xxxx } * 2, or 4 bars { ... } inside another block. A length goes in
   front of what it measures: pattern groove 3 bars {, play 3 bars groove, 3 bars { }.
   Without one, a block lasts exactly as long as what's in it. A line plays what's written, once; loop repeats it until what it's in ends.
   Every number is arithmetic: groove * (4/2), (1+2) bars groove. So / only ever divides,
   and a time is two numbers (7 over 8), not a fraction.
   What's set or defined inside braces stays inside. // starts a comment. Blank lines and
   indentation mean nothing. Settings and definitions carry on into later cells.
   Pure (no audio), so the notebook can also use it to pass state from cell to cell. */
import { applyCapo, buildChord, isRoman, parseKey } from "./chords.js"

export const TPQ = 96 // ticks per quarter note: fine enough for 1/32 notes and triplets
export const DRUMS = ["crash", "ride", "hat", "tom", "floor", "snare", "kick"]
// A drum's other sounds are lines of their own, written drum.variation (ride.bell).
export const VARIATIONS = { ride: ["bell"], hat: ["open", "pedal"] }
// Every drum line name, in the order the drum grid draws them.
export const LANES = DRUMS.flatMap((d) => [d, ...(VARIATIONS[d] || []).map((v) => `${d}.${v}`)])
export const PARTS = ["chords", ...LANES]
export const INSTRUMENTS = ["piano", "epiano", "organ", "pad", "bass", "guitar"]
export const SETTINGS = ["time", "tempo", "step", "sound", "key", "capo", "octave", "kit"]
export const KEYWORDS = ["pattern", "play", "loop", "for", "bars", "bar", "over", "def", "section"]
export const MODIFIERS = ["accent", "ghost", "double"]
export const KITS = ["rock", "synth"]
const SETTING_EXAMPLE = {
  time: "7 over 8",
  tempo: "90",
  step: "1/16",
  sound: "guitar",
  key: "Am",
  capo: "2",
  octave: "3",
  kit: "rock",
}

const MAX_SECONDS = 600
const MAX_TIMES = 16
const MAX_BARS = 64
const SUB = { "": 0, e: 0.25, "&": 0.5, a: 0.75 }
// Steps say how a drum is hit, never which sound (that's the line's name): x hit, g ghost,
// d double, - nothing. A capital adds an accent.
const STEPS = {
  x: {},
  g: { ghost: true },
  d: { double: true },
}
// Old ways of asking for a variation, and the line that does it now.
const VARIATION_LINE = {
  b: "ride.bell",
  o: "hat.open",
  p: "hat.pedal",
  bell: "ride.bell",
  open: "hat.open",
  pedal: "hat.pedal",
}
const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii"]
const TAKEN = new Set([...SETTINGS, ...DRUMS, ...PARTS, ...INSTRUMENTS, ...KEYWORDS, ...MODIFIERS])
const RENAMED = {
  inst: "Use sound guitar",
  instrument: "Use sound guitar",
  beats: "Use time 4 over 4",
  bpm: "Use tempo 120",
  oct: "Use octave 3",
  group: "Put the grouping in the time: time 2+2+3 over 8",
  pattern: "Give each drum its own line, e.g. ride.bell: loop x--",
  repeat: "Put the lines in a pattern and play it more than once: play groove * 2",
  drums: "Each drum gets its own line: kick: x--x---, snare: ----x--",
  bd: "Use kick",
  sd: "Use snare",
  hh: "Use hat",
}
const OLD_KIT = {
  "ride bell": "ride.bell",
  "open hat": "hat.open",
  "hat open": "hat.open",
  "hat pedal": "hat.pedal",
  "pedal hat": "hat.pedal",
  "floor tom": "floor",
  "high tom": "tom",
  "low tom": "tom",
}
const LINE_SHAPES =
  "Each line is a setting (tempo 90), a variable (verse = Am F), pattern, play, " +
  "or inside braces an instrument and what it plays (kick: x--x---) or a pattern to play (groove * 2)"

export function initialState() {
  return {
    groups: [4],
    unit: 4,
    tempo: 120,
    stepTicks: TPQ / 4,
    stepLabel: "1/16",
    sound: "piano",
    key: "C",
    capo: 0,
    octave: 3,
    kit: "rock",
    words: {}, // names that hold steps or chords
    sections: {}, // patterns, by name
  }
}

function cloneState(s) {
  return { ...s, groups: [...s.groups], words: { ...s.words }, sections: { ...s.sections } }
}

// A time the way it's written: 7 over 8, or 3+4 over 4.
export function timeLabel(s) {
  return `${s.groups.join("+")} over ${s.unit}`
}

// Bar length in quarter notes (a beat is always a quarter note).
export function barQuarters(s) {
  return (s.groups.reduce((a, b) => a + b, 0) * 4) / s.unit
}

// The last 16th a bar reaches, counted 1 e & a: a 7 over 8 bar ends on 4e.
export function lastCount(s) {
  const n = Math.round(barQuarters(s) * 4) - 1
  return Math.floor(n / 4) + 1 + ["", "e", "&", "a"][n % 4]
}

const DESCRIBE = {
  time: (s) => "time " + timeLabel(s),
  tempo: (s) => "tempo " + s.tempo,
  step: (s) => "step " + s.stepLabel,
  sound: (s) => "sound " + s.sound,
  key: (s) => "key " + s.key,
  capo: (s) => "capo " + s.capo,
  octave: (s) => "octave " + s.octave,
  kit: (s) => "kit " + s.kit,
}

function tokenize(value) {
  return value.replace(/,/g, " ").replace(/\|/g, " | ").trim().split(/\s+/).filter(Boolean)
}

// Split tokens on bar lines; empty bars (e.g. from a leading |) are dropped.
function splitBars(tokens) {
  const bars = [[]]
  for (const t of tokens) {
    if (t === "|") bars.push([])
    else bars[bars.length - 1].push(t)
  }
  return bars.filter((b) => b.length)
}

const isStep = (c) => c === "-" || !!STEPS[c.toLowerCase()]
// Steps are typed without spaces (x--x---), but spaces between them are fine too.
const isStepRun = (t) => t.length > 0 && [...t].every(isStep)
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
  }
  return d[a.length][b.length]
}

const closest = (name, names) =>
  names.map((n) => [n, editDistance(name, n)]).sort((a, b) => a[1] - b[1])[0]

// For `name: value` where name isn't an instrument.
function unknownInstrument(name) {
  if (RENAMED[name]) return RENAMED[name]
  if (INSTRUMENTS.includes(name)) {
    return `Chords go on a chords: line, and sound ${name} picks what plays them`
  }
  if (name.includes(".")) {
    const close = LANES.find((l) => l.includes(".") && editDistance(name, l) <= 2)
    if (close) return `"${name}" isn't a drum. Did you mean ${close}?`
    return `"${name}" isn't a drum. Drums with a second sound: ${LANES.filter((l) => l.includes(".")).join(", ")}`
  }
  const best = closest(name, PARTS)
  if (best[1] <= 2) return `"${name}" isn't an instrument. Did you mean ${best[0]}?`
  return `"${name}" isn't an instrument. Instruments: ${PARTS.join(", ")}`
}

// Why `name` can't be defined, or null if it can.
function nameProblem(name, value) {
  const n = name.toLowerCase()
  if (PARTS.includes(n)) {
    return `${n} is an instrument, so it takes a colon: ${n}: ${value.startsWith("{") ? "x--x---" : value}`
  }
  if (INSTRUMENTS.includes(n)) {
    return `${n} is a sound. Use sound ${n}, and put the chords on a chords: line`
  }
  if (TAKEN.has(n) || /^x\d+$/.test(name))
    return `${name} already means something, so pick another name`
  return null
}

// ---------------------------------------------------------------------------
// Numbers: wherever a number goes, arithmetic goes, and / only ever divides.
// ---------------------------------------------------------------------------

// Arithmetic over `src`: + - * / and brackets. sumAt and productAt parse from a position
// and return the expression tree (each node has a value) and where it ended, or null.
function numbers(src) {
  let i = 0
  const ws = () => {
    while (src[i] === " ") i++
  }
  const atom = () => {
    ws()
    if (src[i] === "(") {
      i++
      const e = sum()
      ws()
      if (!e || src[i] !== ")") return null
      i++
      return { op: "()", e, value: e.value }
    }
    if (src[i] === "-") {
      i++
      const e = atom()
      return e && { op: "neg", e, value: -e.value }
    }
    const m = /^\d+(\.\d+)?/.exec(src.slice(i))
    if (!m) return null
    i += m[0].length
    return { op: "num", value: Number(m[0]), whole: !m[1] }
  }
  // Reads `first (op next)*` for the given operators, stopping before anything else.
  const chain = (next, ops, apply) => () => {
    let l = next()
    while (l) {
      const back = i
      ws()
      const op = src[i]
      if (!ops.includes(op)) {
        i = back
        break
      }
      i++
      const r = next()
      if (!r) return null
      l = { op, l, r, value: apply(op, l.value, r.value) }
    }
    return l
  }
  const product = chain(atom, "*/", (op, a, b) => (op === "*" ? a * b : a / b))
  const sum = chain(product, "+-", (op, a, b) => (op === "+" ? a + b : a - b))
  const at = (parse) => (pos) => {
    i = pos
    const e = parse()
    return e && Number.isFinite(e.value) ? { e, end: i } : null
  }
  return { sumAt: at(sum), productAt: at(product) }
}

// The whole text as one number, or null if it isn't arithmetic.
function evalNumber(text) {
  const src = String(text).trim()
  const n = numbers(src).sumAt(0)
  return n && n.end === src.length ? n.e : null
}

const nearWhole = (n) => Math.abs(n - Math.round(n)) < 1e-9

// The whole numbers a count is written as: 7 → [7], 3+4 → [3, 4] (felt as 3 then 4).
// null if it's anything else.
function sumTerms(node) {
  const bare = node.op === "()" ? node.e : node
  if (bare.op === "()") return sumTerms(bare)
  if (bare.op === "num") return bare.whole && bare.value > 0 ? [bare.value] : null
  if (bare.op !== "+")
    return nearWhole(bare.value) && bare.value > 0 ? [Math.round(bare.value)] : null
  const l = sumTerms(bare.l)
  const r = sumTerms(bare.r)
  return l && r ? [...l, ...r] : null
}

// "3 bars groove" → { bars: 3, rest: "groove" }. A length goes in front of what it measures.
function lengthPrefix(text) {
  const n = /^[\d(]/.test(text) ? numbers(text).sumAt(0) : null
  const m = n && /^\s*bars?(?![A-Za-z0-9])\s*/.exec(text.slice(n.end))
  return m
    ? { has: true, bars: n.e.value, rest: text.slice(n.end + m[0].length).trim() }
    : { has: false, bars: 0, rest: text }
}

const fmt = (n) => String(+n.toFixed(4))

// groove = { ... } and friends: a pattern written the old way, and what to write now.
function patternHint(name, value) {
  const len = lengthPrefix(value)
  const size = len.has ? `${fmt(len.bars)} bars ` : ""
  const start = "A pattern is defined with the pattern keyword, without =: "
  if (!len.rest || len.rest.startsWith("{")) return start + `pattern ${name} ${size}{`
  return start + `pattern ${name} ${size}{ ${len.rest} }`
}

function checkBars(bars, ln, err) {
  if (bars > 0 && bars <= MAX_BARS) return true
  err(ln, `A length is a number of bars up to ${MAX_BARS}, e.g. 3 bars`)
  return false
}

function applySetting(name, value, ln, state, err) {
  const num = evalNumber(value)
  const whole = (lo, hi) =>
    num && nearWhole(num.value) && num.value >= lo && num.value <= hi ? Math.round(num.value) : null
  if (name === "time") {
    // A time is two numbers, how many over which note: 7 over 8. It isn't a division,
    // so / has no business in it.
    const m = /^(.+?)\s+over\s+(.+)$/.exec(value)
    const count = m && evalNumber(m[1])
    const unit = m && evalNumber(m[2])
    if (!count || !unit) {
      const divided = /^(.*\S)\s*\/\s*(\d+)$/.exec(value)
      err(
        ln,
        divided && num
          ? `/ is division, so ${value} is the number ${+num.value.toFixed(4)}, not a time. ` +
              `Write time ${divided[1].replace(/^\((.*)\)$/, "$1")} over ${divided[2]}`
          : "time is how many notes over which note: time 7 over 8 is seven eighth notes in a bar",
      )
      return false
    }
    const groups = sumTerms(count)
    if (!groups) {
      err(
        ln,
        "The first number of time is how many notes are in a bar, a whole number like 7 or 3+4",
      )
      return false
    }
    if (![1, 2, 4, 8, 16].includes(unit.value)) {
      err(ln, "The second number of time is the note being counted: 1, 2, 4, 8 or 16")
      return false
    }
    if (count.value / unit.value > 8) {
      err(ln, "A bar can be up to 8 whole notes long")
      return false
    }
    state.groups = groups
    state.unit = unit.value
    return true
  }
  if (name === "tempo") {
    if (!num || !(num.value >= 20 && num.value <= 400)) {
      err(ln, "tempo is quarter notes per minute, between 20 and 400")
      return false
    }
    state.tempo = num.value
    return true
  }
  if (name === "step") {
    const ticks = num ? num.value * 4 * TPQ : 0
    if (!num || !nearWhole(ticks) || ticks < 8 || ticks > 4 * TPQ) {
      err(ln, "step is how long one step lasts, like 1/16, 1/8, or 1/12 for triplets")
      return false
    }
    state.stepTicks = Math.round(ticks)
    state.stepLabel = value.replace(/\s+/g, "")
    return true
  }
  if (name === "key") {
    if (!parseKey(value)) {
      err(ln, "key looks like C, Am, Bb or F#m")
      return false
    }
    state.key = value
    return true
  }
  if (name === "capo") {
    const n = whole(0, 12)
    if (n == null) {
      err(ln, "capo is a fret number from 0 to 12")
      return false
    }
    state.capo = n
    return true
  }
  if (name === "octave") {
    const n = whole(1, 6)
    if (n == null) {
      err(ln, "octave is a number from 1 to 6")
      return false
    }
    state.octave = n
    return true
  }
  if (name === "sound") {
    if (!INSTRUMENTS.includes(value)) {
      err(
        ln,
        DRUMS.includes(value)
          ? `Drums get a line of their own, e.g. ${value}: 1 3`
          : `sound is one of: ${INSTRUMENTS.join(", ")}`,
      )
      return false
    }
    state.sound = value
    return true
  }
  if (name === "kit") {
    if (!KITS.includes(value)) {
      err(ln, `kit is one of: ${KITS.join(", ")}`)
      return false
    }
    state.kit = value
    return true
  }
  return false
}

// name = Am E7|G D, or name = X-x-: chords or steps to hand to an instrument.
function defineWord(name, value, ln, state, err) {
  const problem = nameProblem(name, value)
  if (problem) return err(ln, problem)
  if (name !== name.toLowerCase()) {
    return err(ln, `Names for steps and chords are lowercase: ${name.toLowerCase()} = ${value}`)
  }
  if (name.length < 2) {
    return err(
      ln,
      "Names for steps and chords need at least two letters, because single letters are steps",
    )
  }
  if (ROMAN.includes(name)) return err(ln, `${name} is a chord, so pick another name`)
  const tokens = []
  for (const t of tokenize(value)) {
    const w = state.words[t]
    if (!w) tokens.push(t)
    else if (w.tokens.every(isStepRun)) tokens.push(...w.tokens)
    else tokens.push("|", ...w.tokens, "|")
  }
  if (!tokens.length) return err(ln, `${name} = needs something after the =`)
  delete state.sections[name]
  state.words[name] = { tokens, line: ln }
}

// ---------------------------------------------------------------------------
// Reading lines
// ---------------------------------------------------------------------------

const DEF_RE = /^([A-Za-z][A-Za-z0-9]*)\s*=\s*(.*)$/
const TRACK_RE = /^([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)?)\s*:\s*(.*)$/

// What `name = value` is: a setting, steps or chords ("word"), or a pattern written the
// old way ("block": braces, a length, an instrument line, or other patterns' names).
function defKind(name, value, sections) {
  if (SETTINGS.includes(name.toLowerCase())) return "setting"
  const len = lengthPrefix(value)
  if (len.has || len.rest.startsWith("{")) return "block"
  const track = TRACK_RE.exec(value)
  if (track && !/\s/.test(track[1])) return "block"
  return value.split(/[\s()*]+/).some((t) => sections[t]) ? "block" : "word"
}

// Sorts one line (not play, and not a pattern definition) into a setting, a word, an
// instrument line ("part") or patterns to play ("sequence"). Returns null when the
// line is a mistake, after reporting it. A line's unnamed blocks are in `blocks`.
function classify({ ln, text, blocks }, err, sections = {}) {
  if (/^--(\s|$)/.test(text) || /(^|\s)--\s+[A-Za-z]{2,}/.test(text)) {
    err(ln, "Comments start with // now")
    return null
  }
  if (text.startsWith("@")) {
    err(
      ln,
      `"${text.split(/\s+/)[0]}" is the old syntax. Write a setting as its name and value, e.g. key Am`,
    )
    return null
  }
  const two = /^([a-z]+ [a-z]+)\s*[:=]/i.exec(text)
  if (two && OLD_KIT[two[1].toLowerCase()]) {
    err(ln, `"${two[1]}" is now ${OLD_KIT[two[1].toLowerCase()]}`)
    return null
  }

  const def = DEF_RE.exec(text)
  if (def) {
    const name = def[1]
    const value = def[2].trim()
    const kind = defKind(name, value, sections)
    if (kind === "block") {
      err(ln, patternHint(name, value))
      return null
    }
    if (!value) {
      err(ln, `${name} = needs something after the =`)
      return null
    }
    if (kind === "setting") {
      const n = name.toLowerCase()
      err(ln, `${n} is a setting, not a variable, so it takes no =: ${n} ${value}`)
      return null
    }
    if (RENAMED[name.toLowerCase()]) {
      err(ln, RENAMED[name.toLowerCase()])
      return null
    }
    if (evalNumber(value)) {
      // A number can only be a setting, so this is a misspelt or made-up one.
      const best = closest(name.toLowerCase(), SETTINGS)
      err(
        ln,
        best[1] <= 2
          ? `"${name}" isn't a setting. Did you mean ${best[0]}?`
          : `"${name}" isn't a setting. Settings: ${SETTINGS.join(", ")}`,
      )
      return null
    }
    return { kind: "word", ln, name, value }
  }

  const m = TRACK_RE.exec(text)
  if (!m) {
    const tokens = tokenize(text)
    const first = tokens[0] || ""
    const after = tokens.slice(1).join(" ")
    if (text.startsWith("|")) err(ln, "Put these bars at the end of the line above")
    else if (/^repeat\b/i.test(text)) err(ln, RENAMED.repeat)
    else if (/^(pattern|section|def)(\s|$)/.test(text)) {
      err(ln, "A pattern is defined at the top, not inside braces: pattern groove {")
    } else if (PARTS.includes(first.toLowerCase()) && after) {
      err(ln, `Put a colon after ${first}: ${first}: ${after}`)
    } else if (SETTINGS.includes(first.toLowerCase())) {
      // tempo 90: a reserved word and its value
      const name = first.toLowerCase()
      const value = text.slice(first.length).trim()
      if (value) return { kind: "setting", ln, name, value }
      err(ln, `${name} needs a value after it, e.g. ${name} ${SETTING_EXAMPLE[name]}`)
    } else if (after && evalNumber(after) && closest(first.toLowerCase(), SETTINGS)[1] <= 2) {
      err(
        ln,
        `"${first}" isn't a setting. Did you mean ${closest(first.toLowerCase(), SETTINGS)[0]}?`,
      )
    } else if (
      !sections[first.replace(/^\(+/, "").split("*")[0]] &&
      buildChord(first, parseKey("C"))
    ) {
      err(ln, `Chords go on a chords: line, e.g. chords: ${text}`)
    } else if (/^[A-Za-z(*\d{]/.test(first)) {
      // intro (verse chorus) * 2: patterns to play, one after another
      const trailing = /^(?:(.*\S)\s+)?for\s+(\S+)\s+bars?$/.exec(text)
      if (trailing || /(^|\s)for(\s|$)/.test(text)) {
        err(
          ln,
          "A length goes in front of what it measures, without for: " +
            (trailing ? `${trailing[2]} bars ${trailing[1] || "groove"}` : "3 bars groove"),
        )
        return null
      }
      const items = readSequence(text, ln, err, blocks)
      return items && { kind: "sequence", ln, items }
    } else err(ln, LINE_SHAPES)
    return null
  }
  const name = m[1].toLowerCase()
  const value = m[2].trim()
  if (name === "bars" || name === "bar") {
    err(
      ln,
      "A length goes in front of what it measures: pattern groove 3 bars {, or play 3 bars { ... }",
    )
    return null
  }
  if (SETTINGS.includes(name)) {
    err(ln, `${name} is a setting, not an instrument, so it takes no colon: ${name} ${value}`)
    return null
  }
  if (PARTS.includes(name)) {
    if (!value) {
      err(ln, `${name}: needs something after the colon`)
      return null
    }
    const [drum, art = "hit"] = name.split(".")
    return { kind: "part", ln, name, value, drum, art }
  }
  err(ln, unknownInstrument(name))
  return null
}

// ---------------------------------------------------------------------------
// Parts: what one line plays. Each becomes a pattern that plays once over its own
// length, or, with loop, over and over until what it's in ends.
// ---------------------------------------------------------------------------

function chordSlot(tok, part, st, key, err) {
  if (tok === "-") return { hold: true }
  if (tok === "_") return { rest: true }
  if (tok === ".") {
    err(part.ln, "Use - to hold a chord for another slot, e.g. Am - F G")
    return null
  }
  if (tok === "%") {
    err(part.ln, "% stands for a whole bar, so it goes between bar lines on its own: Am F|%")
    return null
  }
  if (/^[a-z][a-z0-9]+$/.test(tok) && !isRoman(tok)) {
    err(
      part.ln,
      st.sections[tok]
        ? `${tok} is a pattern, so it goes on a line of its own, not on an instrument's line`
        : `"${tok}" isn't defined above. Define it first: ${tok} = Am F|C G`,
    )
    return null
  }
  const chord = buildChord(tok, key, st.octave)
  if (!chord) {
    err(part.ln, `"${tok}" isn't a chord I know`)
    return null
  }
  if (st.sound === "guitar") applyCapo(chord, st.capo)
  return { chord }
}

function chordPattern(part, tokens, st, barTicks, err) {
  const key = parseKey(st.key)
  const expanded = []
  for (const t of tokens) {
    const w = st.words[t]
    if (w) expanded.push("|", ...w.tokens, "|")
    else expanded.push(t)
  }
  const bars = []
  let ok = true
  for (const bar of splitBars(expanded)) {
    if (bar.length === 1 && bar[0] === "%") {
      if (bars.length) bars.push(bars[bars.length - 1])
      else {
        err(part.ln, "% repeats the bar before it, but this is the first bar")
        ok = false
      }
      continue
    }
    if (barTicks % bar.length || (barTicks / bar.length) % (TPQ / 4)) {
      err(
        part.ln,
        `A ${timeLabel(st)} bar can't be split evenly into ${bar.length}. ` +
          "Use - to hold a chord for another slot, e.g. Am - F G",
      )
      ok = false
      continue
    }
    const slots = bar.map((tok) => chordSlot(tok, part, st, key, err))
    if (slots.includes(null)) ok = false
    bars.push(slots)
  }
  if (!ok) return null
  if (!bars.length) {
    err(part.ln, "chords: has nothing to play")
    return null
  }
  if (bars[0][0].hold) {
    err(part.ln, "This line starts with - but there's no chord to hold yet")
    return null
  }
  const capo = st.sound === "guitar" ? st.capo : 0
  return {
    kind: "chord",
    ticks: bars.length * barTicks,
    expand(total, loop) {
      const out = []
      let cur = null
      for (let b = 0; b * barTicks < total && (loop || b < bars.length); b++) {
        const bar = bars[b % bars.length]
        const slot = barTicks / bar.length
        bar.forEach((s, i) => {
          if (s.hold) {
            if (cur) cur.ticks += slot
            return
          }
          if (s.rest) {
            cur = null
            return
          }
          cur = {
            tick: b * barTicks + i * slot,
            ticks: slot,
            chord: s.chord,
            label: s.chord.label,
            instrument: st.sound,
            capo,
            repeat: b >= bars.length,
            line: part.ln,
          }
          out.push(cur)
        })
      }
      return out
    },
  }
}

function checkHit(mods, ln, what, err) {
  if (mods.accent && mods.ghost) {
    err(ln, `${what}: a hit can't be both accent and ghost`)
    return false
  }
  return true
}

// `inst` and `art` pick the sound (ride + bell); `lane` is the line it came from.
function hit(part, tick, mods, kit) {
  return {
    inst: part.drum,
    art: part.art,
    lane: part.name,
    kit,
    tick,
    vel: mods.accent ? 1 : mods.ghost ? 0.3 : 0.7,
    accent: !!mods.accent,
    ghost: !!mods.ghost,
    double: !!mods.double,
    line: part.ln,
  }
}

function pushHit(out, part, tick, mods, doubleGap, kit) {
  const ev = hit(part, tick, mods, kit)
  out.push(ev)
  if (mods.double) out.push({ ...ev, tick: tick + doubleGap, hidden: true })
}

// Beats: crash: 1, snare: 2 4|2 4& — positions in bars, counted 1 e & a.
function beatPattern(part, tokens, st, barTicks, err) {
  const qpb = barQuarters(st)
  const bars = []
  let ok = true
  const fail = (msg) => {
    err(part.ln, msg)
    ok = false
  }
  for (const bar of splitBars(tokens)) {
    if (bar.length === 1 && bar[0] === "%") {
      if (bars.length) bars.push(bars[bars.length - 1])
      else fail("% repeats the bar before it, but this is the first bar")
      continue
    }
    if (bar.length === 1 && bar[0] === "-") {
      bars.push([])
      continue
    }
    const hits = []
    for (const tok of bar) {
      const m = /^(\d+)(e|&|a)?$/.exec(tok)
      if (m) {
        const q = Number(m[1]) - 1 + SUB[m[2] || ""]
        if (Number(m[1]) < 1 || q > qpb - 1e-9) {
          fail(`${tok} is past the end of a ${timeLabel(st)} bar, which ends on ${lastCount(st)}`)
        } else hits.push({ tick: Math.round(q * TPQ), mods: {}, tok })
      } else if (VARIATION_LINE[tok]) {
        fail(`"${tok}" is a line of its own now, e.g. ${VARIATION_LINE[tok]}: 1`)
      } else if (MODIFIERS.includes(tok)) {
        if (hits.length) hits[hits.length - 1].mods[tok] = true
        else fail(`"${tok}" goes after the beat it changes, e.g. 3 ${tok}`)
      } else if (tok === ".") {
        fail("Use - for an empty bar: 1|-|-")
      } else if (tok === "-" || tok === "%") {
        fail(`${tok} stands for a whole bar, so it goes between bar lines on its own: 1 3|${tok}`)
      } else if (isStepRun(tok)) {
        fail(
          `"${tok}" is steps, but this line lists beats. Use beats (1 2& 3) or steps (x-x-), not both`,
        )
      } else if (st.words[tok]) {
        fail(`${tok} holds steps or chords, which don't go in a list of beats`)
      } else {
        fail(`"${tok}" isn't a beat. Beats look like 1, 2&, 3e or 4a`)
      }
    }
    for (const h of hits) if (!checkHit(h.mods, part.ln, h.tok, err)) ok = false
    bars.push(hits)
  }
  if (!ok) return null
  if (!bars.length) {
    err(part.ln, `${part.name} has nothing to play`)
    return null
  }
  return {
    kind: "drum",
    ticks: bars.length * barTicks,
    expand(total, loop) {
      const out = []
      for (let b = 0; b * barTicks < total && (loop || b < bars.length); b++) {
        for (const h of bars[b % bars.length]) {
          if (b * barTicks + h.tick < total)
            pushHit(out, part, b * barTicks + h.tick, h.mods, TPQ / 8, st.kit)
        }
      }
      return out
    },
  }
}

const STEP_HELP = "Use x (hit), X (accent), g (ghost), d (double) or - (nothing)"

// One step character → hit modifiers; null for -, undefined when it isn't valid here.
function stepMods(c, part, err, where) {
  if (c === "-") return null
  const mods = { ...STEPS[c.toLowerCase()], accent: c !== c.toLowerCase() }
  if (mods.accent && mods.ghost) {
    err(part.ln, `"${c}"${where}: a ghost note can't be accented`)
    return undefined
  }
  return mods
}

// Steps: kick: x--x--- — one character per step, each one step long.
function stepPattern(part, tokens, st, err) {
  const steps = []
  let ok = true
  const addRun = (tok, viaWord) => {
    const where = viaWord ? ` (in ${viaWord})` : ""
    if (!isStepRun(tok)) {
      const old = /^[-.xXgdDoOpPbB]+$/.test(tok) && /[oOpPbB]/.exec(tok)
      if (old) {
        err(
          part.ln,
          `"${tok}"${where}: ${old[0]} is a line of its own now, e.g. ${VARIATION_LINE[old[0].toLowerCase()]}: x--`,
        )
      } else if (/^[-.xXgdD]+$/.test(tok)) {
        err(part.ln, `"${tok}"${where}: use - for a rest, e.g. x--x---`)
      } else if (/^[a-z][a-z0-9]+$/.test(tok)) {
        err(
          part.ln,
          st.sections[tok]
            ? `${tok} is a pattern, so it goes on a line of its own, not on an instrument's line`
            : `"${tok}" isn't defined above. Define it first: ${tok} = x-x-`,
        )
      } else {
        err(part.ln, `"${tok}"${where} isn't a step. ${STEP_HELP}`)
      }
      ok = false
      return
    }
    for (const c of tok) {
      const s = stepMods(c, part, err, where)
      if (s === undefined) ok = false
      else steps.push(s)
    }
  }
  for (const tok of tokens) {
    const w = st.words[tok]
    if (!w) {
      addRun(tok)
      continue
    }
    if (!w.tokens.every(isStepRun)) {
      err(part.ln, `${tok} holds chords, so it can't go on a drum's line`)
      ok = false
      continue
    }
    for (const t of w.tokens) addRun(t, tok)
  }
  if (!ok) return null
  if (!steps.length) {
    err(part.ln, `${part.name} has nothing to play`)
    return null
  }
  const stepTicks = st.stepTicks
  return {
    kind: "drum",
    ticks: steps.length * stepTicks,
    expand(total, loop) {
      const out = []
      for (let k = 0; k * stepTicks < total && (loop || k < steps.length); k++) {
        const s = steps[k % steps.length]
        if (s) pushHit(out, part, k * stepTicks, s, stepTicks / 2, st.kit)
      }
      return out
    },
  }
}

function readPart(part, st, barTicks, err) {
  let tokens = tokenize(part.value)
  const loop = tokens[0] === "loop"
  if (loop) tokens = tokens.slice(1)
  if (!tokens.length) {
    err(part.ln, `${part.name}: loop needs something to repeat, e.g. ${part.name}: loop x-x-`)
    return null
  }
  if (tokens.includes("for")) {
    err(
      part.ln,
      "A length goes in front of what's played, not on one line: play 2 bars { ... }, or pattern groove 2 bars {",
    )
    return null
  }
  let pattern
  if (part.name === "chords") pattern = chordPattern(part, tokens, st, barTicks, err)
  else if (tokens.some((t) => /^\d/.test(t) || t === "|" || t === "%")) {
    pattern = beatPattern(part, tokens, st, barTicks, err)
  } else pattern = stepPattern(part, tokens, st, err)
  return pattern && { ...pattern, part, loop }
}

// ---------------------------------------------------------------------------
// Clips: what lines, a block, or blocks in a row sound like.
// Times are in seconds from the clip's start; `spans` describe the bar grid over time.
// ---------------------------------------------------------------------------

function meterOf(st) {
  const barTicks = Math.round(barQuarters(st) * TPQ)
  const secPerTick = 60 / (st.tempo * TPQ)
  return {
    time: timeLabel(st),
    groups: st.groups,
    unit: st.unit,
    tempo: st.tempo,
    barTicks,
    secPerTick,
  }
}

// Where something is being played from, for error messages.
const blockCtx = (name, ln) => ({
  ln,
  where: `in ${name}`,
  lengthless: `${name} only has loops, so it has no length. Say how long: pattern ${name} 3 bars {, or play 3 bars ${name}`,
})
const playCtx = (ln) => ({
  ln,
  where: "in this play",
  lengthless: "Everything here loops, so it has no length. Say how long: play 3 bars { ... }",
})
const anonCtx = (ln) => ({
  ln,
  where: "in this block",
  lengthless: "Everything in this block loops, so it has no length. Say how long: 3 bars { ... }",
})

// Plays `parts` together, for `bars` bars if given, otherwise exactly as long as the
// longest line that isn't a loop, and at least `minSec`. Loops fill that.
function partsClip(parts, st, bars, minSec, err, ctx) {
  const meter = meterOf(st)
  const { barTicks, secPerTick } = meter
  const read = parts.map((p) => readPart(p, st, barTicks, err)).filter(Boolean)
  if (read.length < parts.length) return null
  const once = read.filter((p) => !p.loop)
  const ownTicks = bars ? Math.round(bars * barTicks) : Math.max(0, ...once.map((p) => p.ticks))
  const totalTicks = Math.max(ownTicks, Math.round(minSec / secPerTick))
  if (!totalTicks) {
    err(ctx.ln ?? read[0].part.ln, ctx.lengthless)
    return null
  }
  const events = []
  const drumEvents = []
  for (const p of read) {
    for (const e of p.expand(totalTicks, p.loop)) {
      if (p.kind === "drum") drumEvents.push({ ...e, secStart: e.tick * secPerTick })
      else events.push({ ...e, secStart: e.tick * secPerTick, secDur: e.ticks * secPerTick })
    }
  }
  const durSec = totalTicks * secPerTick
  return { durSec, events, drumEvents, spans: [{ ...meter, startSec: 0, durSec }] }
}

// Plays parts and already-evaluated clips together from the same start. They last
// `bars` bars if given, otherwise as long as the longest of them; loops fill that.
function layer(parts, clips, st, bars, err, ctx) {
  const meter = meterOf(st)
  const barSec = meter.barTicks * meter.secPerTick
  const longest = Math.max(0, ...clips.map((c) => c.durSec))
  let own = null
  if (parts.length) {
    own = partsClip(parts, st, bars, bars ? 0 : longest, err, ctx)
    if (!own) return null
  } else if (!clips.length) return null
  const durSec = bars ? bars * barSec : Math.max(own ? own.durSec : 0, longest)
  const inside = (e) => e.secStart < durSec - 1e-9
  const all = own ? [own, ...clips] : clips
  const events = all.flatMap((c) => c.events).filter(inside)
  const drumEvents = all.flatMap((c) => c.drumEvents).filter(inside)
  events.sort((a, b) => a.secStart - b.secStart)
  drumEvents.sort((a, b) => a.secStart - b.secStart)
  // The grid follows the longest sequence, then this block's own bars after it.
  const lead = clips.reduce((a, c) => (!a || c.durSec > a.durSec ? c : a), null)
  const spans = []
  let covered = 0
  if (lead) {
    for (const sp of lead.spans) {
      if (sp.startSec >= durSec - 1e-9) continue
      spans.push({ ...sp, durSec: Math.min(sp.durSec, durSec - sp.startSec) })
    }
    covered = Math.min(lead.durSec, durSec)
  }
  if (durSec > covered + 1e-9) spans.push({ ...meter, startSec: covered, durSec: durSec - covered })
  return { durSec, events, drumEvents, spans }
}

// Lines in braces are one block: they play together, and what's defined inside stays
// inside. `bars` is the length written in front of the block, if any.
function blockClip(lines, state, err, ctx, stack, bars = 0) {
  const st = cloneState(state)
  const read = lines.map((l) => classify(l, err, st.sections)).filter(Boolean)
  for (const l of read) {
    if (l.kind === "setting") applySetting(l.name, l.value, l.ln, st, err)
    else if (l.kind === "word") defineWord(l.name, l.value, l.ln, st, err)
  }
  const parts = []
  for (const l of read) {
    if (l.kind !== "part") continue
    if (parts.some((p) => p.name === l.name)) {
      err(l.ln, `${l.name} already has a line ${ctx.where}. Put it all on one line`)
      continue
    }
    parts.push(l)
  }
  const clips = []
  for (const l of read) {
    if (l.kind !== "sequence") continue
    const clip = sequenceClip(l.items, st, err, l.ln, stack)
    if (!clip) return null
    clips.push(clip)
  }
  if (!parts.length && !clips.length) {
    // A line that's already been reported as a mistake doesn't need this too.
    if (lines.length && read.length === lines.length) {
      err(lines[0].ln, `Nothing to play ${ctx.where}`)
    }
    return null
  }
  return layer(parts, clips, st, bars, err, ctx)
}

// Plays a pattern, or a block without a name, with the settings in effect where it's played.
function sectionClip(sec, state, err, ln, stack, bars) {
  if (sec.anon) {
    return blockClip(sec.lines, state, err, anonCtx(sec.ln), stack, bars || sec.bars)
  }
  if (stack.includes(sec.name)) {
    err(ln, `${sec.name} plays itself, so it would never end`)
    return null
  }
  return blockClip(
    sec.lines,
    state,
    err,
    blockCtx(sec.name, ln),
    [...stack, sec.name],
    bars || sec.bars,
  )
}

function undefinedName(name, st) {
  if (/^x\d+$/.test(name)) return `Repeat with *, e.g. groove * ${name.slice(1)}`
  const word = st.words[name]
  if (word) {
    return word.tokens.every(isStepRun)
      ? `${name} holds steps, so it goes on a drum's line: hat: ${name}`
      : `${name} holds chords, so it goes on the chords line: chords: ${name}`
  }
  const names = Object.keys(st.sections)
  return names.length
    ? `"${name}" isn't defined. Patterns so far: ${names.join(", ")}`
    : `"${name}" isn't defined. Define it first: pattern ${name} {`
}

// Checks a pattern when it's defined, so its mistakes show even if it's never played.
// `owner` is the pattern a block without a name sits in, if any.
function checkSection(sec, state, err, owner = sec.anon ? null : sec.name) {
  const where = sec.anon ? "this block" : sec.name
  const st = cloneState(state)
  const read = sec.lines.map((l) => classify(l, err, st.sections)).filter(Boolean)
  for (const l of read) {
    if (l.kind === "setting") applySetting(l.name, l.value, l.ln, st, err)
    else if (l.kind === "word") defineWord(l.name, l.value, l.ln, st, err)
  }
  const parts = read.filter((l) => l.kind === "part")
  parts.forEach((l, i) => {
    if (parts.slice(0, i).some((p) => p.name === l.name)) {
      err(l.ln, `${l.name} already has a line in ${where}. Put it all on one line`)
    }
    readPart(l, st, meterOf(st).barTicks, err)
  })
  const names = (items, ln) => {
    for (const it of items) {
      if (it.items) names(it.items, ln)
      else if (it.block) checkSection(it.block, st, err, owner)
      else if (it.name === owner) err(ln, `${owner} plays itself, so it would never end`)
      else if (!st.sections[it.name]) err(ln, undefinedName(it.name, st))
    }
  }
  for (const l of read) if (l.kind === "sequence") names(l.items, l.ln)
  // A line that's already been reported as a mistake doesn't need this too.
  const playable = read.some((l) => l.kind === "part" || l.kind === "sequence")
  if (!playable && read.length === sec.lines.length) {
    err(sec.ln, sec.anon ? "This block has nothing to play" : `${sec.name} has nothing to play`)
  }
}

function shift(clip, by, again) {
  return {
    events: clip.events.map((e) => ({
      ...e,
      secStart: e.secStart + by,
      repeat: e.repeat || again,
    })),
    drumEvents: clip.drumEvents.map((e) => ({ ...e, secStart: e.secStart + by })),
    spans: clip.spans.map((s) => ({ ...s, startSec: s.startSec + by })),
  }
}

// intro (verse chorus) * 2 3 bars groove → items in playing order. Each is a name, a
// block without a name ({#1}, kept in `blocks`) or a bracketed group, with how many
// times it plays and the length in front of it, if any.
// Counts and lengths are arithmetic: groove * (4/2), (1+2) bars groove.
function readSequence(line, ln, err, blocks = {}) {
  const text = line.trim()
  const num = numbers(text)
  let i = 0
  let ok = true
  const fail = (msg) => {
    if (ok) err(ln, msg)
    ok = false
  }
  const ws = () => {
    while (/\s/.test(text[i] || "")) i++
  }
  const items = (closing) => {
    const out = []
    while (ok) {
      ws()
      if (i >= text.length) {
        if (closing) fail("A ( is missing its )")
        break
      }
      if (text[i] === ")") {
        if (!closing) fail("This ) doesn't close anything")
        i++
        break
      }
      if (text[i] === "*") {
        const n = num.productAt(i + 1)
        if (!out.length) fail("* repeats what's before it, but nothing is")
        else if (!n) fail("* needs a number after it, e.g. groove * 2")
        else if (!nearWhole(n.e.value) || n.e.value < 1 || n.e.value > MAX_TIMES) {
          fail(`* ${text.slice(i + 1, n.end).trim()}: something can play 1 to ${MAX_TIMES} times`)
        } else {
          out[out.length - 1].times *= Math.round(n.e.value)
          i = n.end
        }
        continue
      }
      // A length in front: 3 bars groove
      let bars = 0
      const len = lengthPrefix(text.slice(i))
      if (len.has) {
        if (!(len.bars > 0 && len.bars <= MAX_BARS)) {
          fail(`A length is a number of bars up to ${MAX_BARS}, e.g. 3 bars`)
          break
        }
        if (!len.rest) {
          fail(`${text} of what? Put a pattern's name after it`)
          break
        }
        bars = len.bars
        i = text.length - len.rest.length
      }
      if (text[i] === "(") {
        i++
        out.push({ items: items(true), times: 1, bars })
        continue
      }
      const key = /^\{#\d+\}/.exec(text.slice(i))
      if (key && blocks?.[key[0]]) {
        i += key[0].length
        out.push({ block: blocks[key[0]], times: 1, bars })
        continue
      }
      const name = /^[A-Za-z][A-Za-z0-9]*/.exec(text.slice(i))
      if (!name) {
        const tok = text.slice(i).split(/\s/)[0]
        fail(
          /^\d/.test(tok)
            ? `"${tok}" needs bars after it, e.g. 3 bars groove`
            : `"${tok}" doesn't belong here. This line takes names, * 2 to repeat, and ( ) to group`,
        )
        break
      }
      if (/^x\d+$/.test(name[0])) {
        const before = out.length && out[out.length - 1].name ? out[out.length - 1].name : "groove"
        fail(`Repeat with *: ${before} * ${name[0].slice(1)}`)
        break
      }
      i += name[0].length
      out.push({ name: name[0], times: 1, bars })
    }
    return out
  }
  const seq = items(false)
  return ok ? seq : null
}

function sequenceClip(items, state, err, ln, stack = []) {
  let t = 0
  const out = { events: [], drumEvents: [], spans: [] }
  const seen = new Set()
  for (const it of items) {
    let clip
    if (it.items) {
      clip = sequenceClip(it.items, state, err, ln, stack)
      if (clip && it.bars) clip = layer([], [clip], state, it.bars, err, playCtx(ln))
    } else if (it.block) {
      clip = sectionClip(it.block, state, err, ln, stack, it.bars)
    } else {
      const sec = state.sections[it.name]
      if (!sec) {
        err(ln, undefinedName(it.name, state))
        return null
      }
      clip = sectionClip(sec, state, err, ln, stack, it.bars)
    }
    if (!clip) return null
    for (let k = 0; k < it.times; k++) {
      const key = it.name || null
      const again = k > 0 || (key != null && seen.has(key))
      const moved = shift(clip, t, again)
      out.events.push(...moved.events)
      out.drumEvents.push(...moved.drumEvents)
      out.spans.push(...moved.spans)
      t += clip.durSec
    }
    if (it.name) seen.add(it.name)
  }
  return { ...out, durSec: t }
}

// Grid cells per quarter note: the coarsest that still shows every drum hit.
function gridResolution(drumEvents, barTicks) {
  for (const res of [1, 2, 4, 3, 6, 8, 12]) {
    const cell = TPQ / res
    if (barTicks % cell === 0 && drumEvents.every((e) => e.hidden || e.tick % cell === 0))
      return res
  }
  return 24
}

// Joins neighbouring spans in the same meter, then gives each its drum hits as ticks
// from its start — the shape the drum grid draws.
function gridBlocks(spans, drumEvents) {
  const merged = []
  for (const s of [...spans].sort((a, b) => a.startSec - b.startSec)) {
    const last = merged[merged.length - 1]
    if (
      last &&
      last.time === s.time &&
      last.tempo === s.tempo &&
      Math.abs(last.startSec + last.durSec - s.startSec) < 1e-6
    ) {
      last.durSec += s.durSec
    } else merged.push({ ...s })
  }
  return merged.map((s) => {
    const inside = drumEvents
      .filter((e) => e.secStart >= s.startSec - 1e-9 && e.secStart < s.startSec + s.durSec - 1e-9)
      .map((e) => ({ ...e, tick: Math.round((e.secStart - s.startSec) / s.secPerTick) }))
    const barSec = s.barTicks * s.secPerTick
    return {
      ...s,
      bars: Math.ceil(s.durSec / barSec - 1e-6), // a part bar still gets a row
      plays: [s.startSec],
      times: 1,
      drumEvents: inside,
      res: gridResolution(inside, s.barTicks),
    }
  })
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

// Parses one music cell. `inherited` is the state left by the cells above (settings and
// definitions); the result's `state` is what this cell passes on. Each play gives one
// output.
export function parseCell(src, inherited = initialState()) {
  const errors = []
  const err = (line, msg) => {
    if (!errors.some((e) => e.line === line && e.msg === msg)) errors.push({ line, msg })
  }
  const state = cloneState(inherited)
  const setHere = new Map() // setting name → the line in this cell that set it
  const outputs = []
  let capoLine = null

  const lines = String(src || "")
    .split("\n")
    .map((raw, i) => ({ ln: i + 1, text: raw.replace(/\/\/.*$/, "").trim() }))

  // Skips to the } that closes a block opened on line `at`, counting the blocks inside it.
  const skipBlock = (at) => {
    let depth = 0
    for (let i = at; i < lines.length; i++) {
      for (const c of lines[i].text) {
        if (c === "{") depth++
        else if (c === "}" && --depth <= 0) return i
      }
    }
    return lines.length
  }
  // For a line that's a mistake: if it opened a block, skip the block's lines too, so
  // one mistake gives one message.
  const skipIfOpen = (i) => (/\{$/.test(lines[i].text) ? skipBlock(i) : i)
  let anonCount = 0
  // Reads a { ... } block that starts with `rest` (the text after the {) on line `at`.
  // Returns its lines, the index of its last line, and what follows the closing }.
  // A block inside it without a name plays where it's written, like a pattern's name:
  // on its line it becomes {#1}, and the line keeps the block in `blocks`.
  // With `oneLine`, reads a single line instead (the rest of a play), through the line
  // where its last block closes.
  const readBlock = (at, rest, what, oneLine = false) => {
    const body = []
    let i = at
    let text = rest
    let cur = null // the line being read: { ln, text, blocks }
    const flush = () => {
      const t = cur ? cur.text.trim() : ""
      if (t && /^play(\s|$)/.test(t)) err(cur.ln, "play goes at the top, not inside braces")
      else if (t) body.push({ ...cur, text: t })
      cur = null
    }
    for (;;) {
      cur ??= { ln: lines[i].ln, text: "", blocks: null }
      const brace = /[{}]/.exec(text)
      if (!brace) {
        cur.text += text
        flush()
        if (oneLine) return { body, end: i, tail: "" }
        if (++i >= lines.length) {
          err(lines[at].ln, `${what} needs a } to close it`)
          return { body, end: i, tail: "" }
        }
        text = lines[i].text
        continue
      }
      cur.text += text.slice(0, brace.index)
      text = text.slice(brace.index + 1)
      if (brace[0] === "}") {
        if (oneLine) {
          err(lines[i].ln, "This } doesn't close anything")
          continue
        }
        flush()
        return { body, end: i, tail: text.trim() }
      }
      // A block inside this one
      const head = cur.text.trim()
      const inner = readBlock(i, text.trim(), "This {")
      if (inner.end >= lines.length) {
        flush()
        return { body, end: inner.end, tail: "" }
      }
      i = inner.end
      text = inner.tail
      if (/^(pattern|play)(\s|$)/.test(head)) {
        err(
          cur.ln,
          /^play(\s|$)/.test(head)
            ? "play goes at the top, not inside braces"
            : "A pattern can't be defined inside braces. Define it above, then use its name here",
        )
        cur.text = ""
      } else if (/[:=]$/.test(head)) {
        err(cur.ln, `Braces can't go after ${head}. A block goes on its own line: { kick: x--- }`)
        cur.text = ""
      } else if (!inner.body.length) {
        err(cur.ln, "These braces have nothing in them")
        cur.text = ""
      } else {
        const key = `{#${++anonCount}}`
        cur.blocks = {
          ...cur.blocks,
          [key]: { key, anon: true, ln: cur.ln, lines: inner.body, bars: 0 },
        }
        cur.text += ` ${key} `
      }
    }
  }
  // Nothing follows a closing brace. `front(n)` is the right way to write a length there.
  const checkTail = (tail, ln, front) => {
    if (!tail) return true
    const after = /^(?:for\s+)?(\S+)\s+bars?$/.exec(tail)
    err(
      ln,
      after || /^for(\s|$)/.test(tail)
        ? `A length goes in front of what it measures: ${front(after ? after[1] : 3)}`
        : "Nothing can follow a }",
    )
    return false
  }
  const noteCapo = (body) => {
    for (const l of body) if (/^capo\s+[1-9]/.test(l.text)) capoLine ??= l.ln
  }

  for (let i = 0; i < lines.length; i++) {
    const { ln, text } = lines[i]
    if (!text) continue

    if (text.startsWith("}")) {
      err(ln, "This } doesn't close anything")
      continue
    }
    const old = /^(section|def)\s+([A-Za-z][A-Za-z0-9]*)/.exec(text)
    if (old || /^(section|def)(\s|$)/.test(text)) {
      err(ln, `A pattern is defined with the pattern keyword: pattern ${old ? old[2] : "groove"} {`)
      i = skipIfOpen(i)
      continue
    }

    // pattern groove { ... }, pattern groove 3 bars { ... }
    if (/^pattern(\s|$)/.test(text)) {
      const head = /^pattern\s+([A-Za-z][A-Za-z0-9]*)\s*(.*)$/.exec(text)
      const len = head ? lengthPrefix(head[2]) : null
      if (!head || !len.rest.startsWith("{")) {
        const eq = /^pattern\s+([A-Za-z][A-Za-z0-9]*)\s*=/.exec(text)
        err(
          ln,
          eq
            ? `pattern is a keyword, so it takes no =: pattern ${eq[1]} {`
            : "A pattern looks like: pattern groove {, or pattern groove 3 bars {",
        )
        i = skipIfOpen(i)
        continue
      }
      const name = head[1]
      const block = readBlock(i, len.rest.slice(1).trim(), `pattern ${name}`)
      i = block.end
      noteCapo(block.body)
      const okTail = checkTail(
        block.tail,
        lines[block.end]?.ln ?? ln,
        (n) => `pattern ${name} ${n} bars {`,
      )
      const problem = nameProblem(name, "{")
      if (problem) err(ln, problem)
      else if (okTail && (!len.has || checkBars(len.bars, ln, err))) {
        delete state.words[name]
        state.sections[name] = { name, ln, lines: block.body, bars: len.bars }
        checkSection(state.sections[name], state, err)
      }
      continue
    }

    if (/^play\s*[:=]/.test(text)) {
      err(
        ln,
        /^play\s*=/.test(text)
          ? "play is a keyword, not a name, so it takes no =: play { ... }"
          : "play is a keyword, not an instrument, so it takes no colon: play groove * 2",
      )
      i = skipIfOpen(i)
      continue
    }

    const play = /^play(?:\s+(.*))?$/.exec(text)
    if (play) {
      // play plays what's after it: a block in braces, or one line. play groove * 2 and
      // play { groove * 2 } are the same thing.
      let rest = (play[1] || "").trim()
      if (/^for(\s|$)/.test(rest)) {
        const n = /^for\s+(\S+)\s+bars?$/.exec(rest)
        err(
          ln,
          `A length goes in front of what it measures, without for: play ${n ? n[1] : 3} bars { ... }`,
        )
        continue
      }
      let bars = 0
      let ok = true
      const len = lengthPrefix(rest)
      if (len.has && (!len.rest || len.rest.startsWith("{") || TRACK_RE.test(len.rest))) {
        // play 3 bars { ... }, play 3 bars kick: loop x---
        ok = checkBars(len.bars, ln, err)
        bars = len.bars
        rest = len.rest
      }
      if (!rest) {
        err(
          ln,
          bars
            ? `${text} of what? Put a block or a pattern after it: ${text} { ... }`
            : "play needs something after it: play groove * 2, or play { ... }",
        )
        continue
      }
      let arg = [{ ln, text: rest }]
      let label = text
      const lengthAfter = (tail) => /^(?:for\s+)?\S+\s+bars?$|^for(\s|$)/.test(tail)
      if (rest.startsWith("{")) {
        const block = readBlock(i, rest.slice(1).trim(), "play")
        if (block.end > i) label = text.replace(/\{.*$/, "{ … }")
        if (!block.body.length) {
          err(ln, "This play has nothing in its braces")
          ok = false
        }
        if (block.tail && !lengthAfter(block.tail)) {
          // play { ... } * 2: the block is one of the things played in a row
          const key = `{#${++anonCount}}`
          const size = bars ? `${fmt(bars)} bars ` : ""
          arg = [
            {
              ln,
              text: `${size}${key} ${block.tail}`,
              blocks: { [key]: { key, anon: true, ln, lines: block.body, bars: 0 } },
            },
          ]
          bars = 0
          if (block.end > i) label = `${label} ${block.tail}`
        } else {
          if (!checkTail(block.tail, lines[block.end]?.ln ?? ln, (n) => `play ${n} bars { ... }`)) {
            ok = false
          }
          arg = block.body
        }
        i = block.end
      } else if (rest.includes("{")) {
        // play groove { snare: xxxx }: blocks among the names
        const line = readBlock(i, rest, "play", true)
        if (line.end > i) label = text.replace(/\{.*$/, "{ … }")
        i = line.end
        arg = line.body
        if (!arg.length) ok = false
      }
      noteCapo(arg)
      const out = ok ? blockClip(arg, state, err, playCtx(ln), [], bars) : null
      if (out && out.durSec > MAX_SECONDS) {
        err(ln, "This plays for over 10 minutes. Use smaller numbers after *")
      } else if (out) {
        outputs.push({
          line: ln,
          label,
          durSec: out.durSec,
          totalSec: out.durSec,
          events: out.events,
          chords: out.events.filter((e) => e.chord),
          drumEvents: out.drumEvents,
          blocks: gridBlocks(out.spans, out.drumEvents),
        })
      }
      continue
    }

    // groove = { ... } and groove { ... }: a pattern written without its keyword
    const def = DEF_RE.exec(text)
    if (def && defKind(def[1], def[2].trim(), state.sections) === "block") {
      err(ln, patternHint(def[1], def[2].trim()))
      i = skipIfOpen(i)
      continue
    }
    const bare = /^([A-Za-z][A-Za-z0-9]*)\s*\{/.exec(text)
    if (bare) {
      err(ln, `${bare[1]} needs the pattern keyword in front: pattern ${bare[1]} {`)
      i = skipIfOpen(i)
      continue
    }
    // { ... } or 3 bars { ... } on its own: a block, but nothing plays it
    if (lengthPrefix(text).rest.startsWith("{")) {
      err(
        ln,
        `Nothing plays this block. Put play in front: play ${text.replace(/\{.*$/, "{ ... }")}`,
      )
      i = readBlock(i, text, "", true).end
      continue
    }

    const l = classify({ ln, text }, err, state.sections)
    if (!l) continue
    if (l.kind === "setting") {
      if (applySetting(l.name, l.value, ln, state, err)) {
        setHere.set(l.name, ln)
        if (l.name === "capo" && state.capo > 0) capoLine ??= ln
      }
    } else if (l.kind === "word") defineWord(l.name, l.value, ln, state, err)
    else if (l.kind === "part") {
      // Nothing floats at the top: what plays is inside a pattern or a play.
      err(ln, `An instrument's line goes inside braces: in a pattern, or play { ${text} }`)
    } else err(ln, `Nothing plays this line. Write play ${text}`)
  }

  // A capo only moves guitar chords, so a capo in a cell where nothing plays guitar is a
  // mistake (usually a missing sound guitar). One inherited from a cell above is fine.
  const guitar = outputs.some((o) => o.chords.some((e) => e.instrument === "guitar"))
  if (capoLine != null && outputs.length && !guitar) {
    err(capoLine, "capo only works on guitar. Add sound guitar")
  }

  const start = initialState()
  const fromAbove = Object.keys(DESCRIBE)
    .filter((k) => !setHere.has(k) && DESCRIBE[k](inherited) !== DESCRIBE[k](start))
    .map((k) => DESCRIBE[k](inherited))

  // One timeline with every output back to back, for views that show a single player.
  let t = 0
  const events = []
  const drumEvents = []
  const blocks = []
  for (const o of outputs) {
    events.push(...o.events.map((e) => ({ ...e, secStart: e.secStart + t })))
    drumEvents.push(...o.drumEvents.map((e) => ({ ...e, secStart: e.secStart + t })))
    blocks.push(
      ...o.blocks.map((b) => ({ ...b, startSec: b.startSec + t, plays: [b.startSec + t] })),
    )
    t += o.durSec
  }

  errors.sort((a, b) => a.line - b.line)
  return {
    kind: "music",
    outputs,
    blocks,
    events,
    chords: events.filter((e) => e.chord),
    drumEvents,
    totalSec: t,
    errors,
    state,
    fromAbove,
  }
}
