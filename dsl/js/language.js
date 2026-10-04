/* The music-cell language. A cell is a script, read top to bottom. Every line starts by
   saying what it is:
     tempo 90                 a setting: a reserved word and its value (time 7 over 8,
                              sound guitar, step 1/16). Settings aren't names, so no =.
     steps pair = X-x-        a name, with its type in front. There are three types:
     chords verse = Am E7|G D   steps (a drum's hits), chords, and pattern (lines in
     pattern groove = { }       braces that play together). A name only ever holds its
                              type, and only goes where that type goes.
     kick: x--x---            inside braces, an instrument and what it plays. The colon
                              only ever means this. A drum takes steps (or beats: 1 2& 3),
                              chords: takes chords. Lines play together, so two drums on
                              one step is two lines. Each instrument has one line in a
                              block; to layer a drum, its line takes a block of steps.
     play { }                 plays what's after it, a pattern or one line, and gives one
                              output with a player and a drum grid. Nothing plays unless
                              it's inside a play.
     bar 2 { }                what plays in bar 2 of what it's in, and nowhere else. One
                              line needs no braces (bar 2 crash: 1), and bars 3 to 4 { }
                              takes a run of bars.
   A pattern is a loop: everything in it repeats until the pattern ends, and without a
   length it lasts until its lines line up again. A play is a timeline: its own lines play
   once, and a pattern on a line of its own repeats until the play ends. Names in a row
   play one after another (intro verse verse), and a pattern without a name plays wherever
   a name could: intro { snare: xxxx } outro. A length goes in front of what it measures,
   and a pattern given a length repeats for that long: pattern groove = 3 bars {,
   play 6 bars groove. Anything that repeats has to fit what it's in a whole number of
   times.
   Every number is arithmetic: (1+2) bars groove, tempo 60*2. So * and / only ever do
   arithmetic, and a time is two numbers (7 over 8), not a fraction.
   { } is a block: what's in it evaluates to one value, played together. Usually that's a
   pattern; after a drum's colon it's that drum's steps, one layer a line, which repeat
   until they line up again. In a block, where two lines hit the same drum at the same
   moment, the lower line wins, and a rest never does.
   What's set or named inside braces stays inside. // starts a comment. Blank lines and
   indentation mean nothing. Settings and names carry on into later cells.
   Pure (no audio), so the notebook can also use it to pass state from cell to cell. */
import { applyCapo, buildChord, isRoman, parseKey } from "./chords.js"

export const TPQ = 96 // ticks per quarter note: fine enough for 1/32 notes and triplets
export const DRUMS = ["crash", "ride", "hat", "tom", "floor", "snare", "kick"]
// A drum's other sounds are lines of their own, written drum.variation (ride.bell).
// snare.ghost plays the snare's ghost notes, so they can go under its main line.
export const VARIATIONS = { ride: ["bell"], hat: ["open", "pedal"], snare: ["ghost", "rim"] }
// Every drum line name, in the order the drum grid draws them.
export const LANES = DRUMS.flatMap((d) => [d, ...(VARIATIONS[d] || []).map((v) => `${d}.${v}`)])
export const PARTS = ["chords", ...LANES]
export const INSTRUMENTS = ["piano", "epiano", "organ", "pad", "bass", "guitar"]
export const SETTINGS = ["time", "tempo", "step", "sound", "key", "capo", "octave", "kit"]
// The types a name can have. Its type goes in front of it: steps pair = X-x-
export const TYPES = ["steps", "chords", "pattern"]
// loop, for, def and section are old words, kept so they're explained rather than taken as
// names.
export const KEYWORDS = [
  ...TYPES,
  "play",
  "bars",
  "bar",
  "to",
  "over",
  "loop",
  "for",
  "def",
  "section",
]
// Old words for how a beat is hit, kept so they're explained: a step after the beat says it
// now (2 X).
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
  pattern: "Give each drum its own line, e.g. ride.bell: x--",
  repeat:
    "Put the lines in a pattern, which repeats: pattern verse = { ... }, then play 8 bars verse",
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
// A block written inside a line: {#1} on the line, and the block in the line's `blocks`.
const BLOCK_KEY = /^\{#\d+\}$/
const CHORDS_BLOCK =
  "Chords play one at a time, so they can't be layered in a block. Put them on one line: chords: Am F|C G"

const LINE_SHAPES =
  "Each line is a setting (tempo 90), a name with its type (chords verse = Am F, " +
  "pattern groove = { ... }), play, or inside braces an instrument and what it plays " +
  "(kick: x--x---) or patterns to play (intro verse)"

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
    words: {}, // names for steps and chords: { type, tokens }
    sections: {}, // names for patterns
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

// Arithmetic over `src`: + - * / and brackets. sumAt parses from a position and returns
// the expression tree (each node has a value) and where it ended, or null.
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
  const sumAt = (pos) => {
    i = pos
    const e = sum()
    return e && Number.isFinite(e.value) ? { e, end: i } : null
  }
  return { sumAt }
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

// pattern groove 3 bars { and older ways to name a pattern, and what to write now.
function patternHint(text) {
  const m = /^(?:pattern|section|def)\s+([A-Za-z][A-Za-z0-9]*)\s*([^{=]*)/.exec(text)
  const len = lengthPrefix((m?.[2] || "").trim())
  const size = len.has ? `${fmt(len.bars)} bars ` : ""
  return `A pattern gets its name with =: pattern ${m?.[1] || "groove"} = ${size}{ ... }`
}

// pattern name = { ... }, = 3 bars { ... }, = intro verse: a pattern with a name. `value`
// is what follows the =, with its blocks already read (as {#1}, kept in `blocks`). A
// length in front is the pattern's own.
function namedBlock(name, value, ln, blocks) {
  const len = lengthPrefix(value)
  const only = /^\{#\d+\}$/.exec(len.rest)
  if (only && blocks?.[only[0]]) {
    return { name, ln, lines: blocks[only[0]].lines, bars: len.bars, has: len.has }
  }
  if (len.has && TRACK_RE.test(len.rest)) {
    return { name, ln, lines: [{ ln, text: len.rest }], bars: len.bars, has: true }
  }
  // A length in front of anything else measures that, not the pattern: 8 bars loop verse
  return { name, ln, lines: [{ ln, text: value, blocks }], bars: 0, has: false }
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

const CHORD_MARKS = ["|", "-", "_", "%"]

// steps name = X-x-, chords name = Am E7|G D: steps or chords to hand to an instrument.
// What's written has to be the type that's declared.
function defineWord(type, name, value, ln, state, err, blocks = null) {
  const problem = nameProblem(name, value)
  if (problem) return err(ln, problem)
  if (name !== name.toLowerCase()) {
    return err(
      ln,
      `Names for steps and chords are lowercase: ${type} ${name.toLowerCase()} = ${value}`,
    )
  }
  if (name.length < 2) {
    return err(
      ln,
      "Names for steps and chords need at least two letters, because single letters are steps",
    )
  }
  if (ROMAN.includes(name)) return err(ln, `${name} is a chord, so pick another name`)
  if (type === "steps" && listsBeats(tokenize(value))) {
    // steps backbeat = 2 4: beats, as steps
    const run = beatsAsSteps({ name, art: "hit", ln, blocks }, tokenize(value), state, err)
    if (run == null) return
    delete state.sections[name]
    state.words[name] = { type, tokens: [run], line: ln }
    return
  }
  const key = parseKey(state.key)
  const tokens = []
  for (const t of tokenize(value)) {
    const w = state.words[t]
    if (blocks?.[t]) {
      // steps ghosts = { ... }: a block of steps is steps
      if (type !== "steps") return err(ln, CHORDS_BLOCK)
      const run = stepBlock(blocks[t], state, err)
      if (run == null) return
      tokens.push(run)
    } else if (w && w.type !== type) return err(ln, `${t} is ${w.type}, so it can't go in ${type}`)
    else if (w) tokens.push(...(type === "steps" ? w.tokens : ["|", ...w.tokens, "|"]))
    else if (state.sections[t]) {
      return err(ln, `${t} is a pattern, so it can't go in ${type}`)
    } else if (t === "loop") {
      return err(
        ln,
        `loop isn't part of ${type}, and isn't needed: everything in a pattern repeats until it ends`,
      )
    } else if (
      type === "steps" ? isStepRun(t) || t === "|" : CHORD_MARKS.includes(t) || buildChord(t, key)
    ) {
      tokens.push(t)
    } else if (/^[a-z][a-z0-9]+$/.test(t) && !isRoman(t) && !/^[-xgd]+$/.test(t)) {
      return err(ln, `"${t}" isn't defined above. Name it first: ${type} ${t} = ...`)
    } else if (type === "steps") {
      return err(
        ln,
        buildChord(t, key)
          ? `"${t}" is a chord, and ${name} is steps. For chords, write chords ${name} = ${value}`
          : `"${t}" isn't a step. ${STEP_HELP}`,
      )
    } else {
      return err(
        ln,
        isStepRun(t)
          ? `"${t}" is steps, and ${name} is chords. For steps, write steps ${name} = ${value}`
          : `"${t}" isn't a chord I know`,
      )
    }
  }
  if (!tokens.length) return err(ln, `${type} ${name} = needs something after the =`)
  delete state.sections[name]
  state.words[name] = { type, tokens, line: ln }
}

// ---------------------------------------------------------------------------
// Reading lines
// ---------------------------------------------------------------------------

const DEF_RE = /^([A-Za-z][A-Za-z0-9]*)\s*=\s*(.*)$/
const TYPED_RE = /^(steps|chords|pattern)\s+([A-Za-z][A-Za-z0-9]*)\s*=\s*(.*)$/
const TRACK_RE = /^([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)?)\s*:\s*(.*)$/
// bar 2 ..., bars 3 to 4 ...: a place in front of what plays there
const PLACE_RE = /^bars?(\s+\S|$)/

// name = value, with or without a type in front. null if the line isn't one.
function readDecl(text) {
  const typed = TYPED_RE.exec(text)
  if (typed) return { type: typed[1], name: typed[2], value: typed[3].trim() }
  const def = DEF_RE.exec(text)
  return def ? { type: null, name: def[1], value: def[2].trim() } : null
}

// Whether a value is written as a pattern: braces, a length, or an instrument's line.
function patternText(value) {
  const len = lengthPrefix(value)
  if (len.has || /[{(]/.test(len.rest) || PLACE_RE.test(value)) return true
  const track = TRACK_RE.exec(value)
  return !!track && !/\s/.test(track[1])
}

// Whether a token can be part of steps: a step run, a name of steps, a beat, a bar line,
// or a block of steps.
function stepsToken(t, st, blocks) {
  if (blocks?.[t]) return holdsSteps(blocks[t], st)
  return isStepRun(t) || st.words[t]?.type === "steps" || BEAT_RE.test(t) || t === "|" || t === "%"
}

// Whether everything in a block is steps (or beats, or names of steps): a drum's layers.
function holdsSteps(block, st) {
  return block.lines.every((l) => tokenize(l.text).every((t) => stepsToken(t, st, l.blocks)))
}

// What a value is, from how it's written: a pattern (braces, a length, an instrument's
// line, or other patterns' names), steps or chords. Braces holding steps are steps.
function shapeOf(value, st, blocks = null) {
  const tokens = tokenize(value)
  const stepsLike = tokens.every((t) => stepsToken(t, st, blocks))
  if (stepsLike && tokens.some((t) => blocks?.[t])) return "steps"
  if (patternText(value)) return "pattern"
  // Beats, which are steps written by where they hit: -|3 dd
  if (stepsLike && tokens.some((t) => BEAT_RE.test(t))) return "steps"
  if (tokens.some((t) => st.sections[t])) return "pattern"
  const key = parseKey(st.key)
  const steps = tokens.every((t) => isStepRun(t) || t === "|" || st.words[t]?.type === "steps")
  const chords = tokens.every(
    (t) => CHORD_MARKS.includes(t) || st.words[t]?.type === "chords" || buildChord(t, key),
  )
  // D and G are both a step and a chord. On their own they're almost always chords.
  if (steps && chords) return tokens.some((t) => /^[A-G]/.test(t)) ? "chords" : "steps"
  return steps ? "steps" : chords ? "chords" : "pattern"
}

// Names a pattern (pattern name = { ... }) in `st`, the state of the block it's written
// in. Returns the pattern, or null if the name or length is a mistake.
function defineBlock(l, st, err) {
  const problem = nameProblem(l.name, "{")
  if (problem) {
    err(l.ln, problem)
    return null
  }
  const sec = namedBlock(l.name, l.value, l.ln, l.blocks)
  if (sec.has && !checkBars(sec.bars, l.ln, err)) return null
  delete st.words[l.name]
  st.sections[l.name] = sec
  return sec
}

// A declaration, sorted into a word (steps or chords) or a named pattern ("blockdef").
// Reports a missing type, or a value that isn't the type it says, and returns null for
// mistakes that leave nothing to define.
function classifyDecl({ type, name, value }, { ln, blocks }, err, st) {
  const lower = name.toLowerCase()
  if (!type && TYPES.includes(lower)) {
    err(
      ln,
      `${lower} needs a name after it: ${lower} ${lower === "pattern" ? "groove" : "riff"} = ...`,
    )
    return null
  }
  if (!value) {
    err(ln, `${type ? type + " " : ""}${name} = needs something after the =`)
    return null
  }
  const shape = shapeOf(value, st, blocks)
  // How the value reads in a message, with its blocks as { ... }
  const shown = value.replace(/\{#\d+\}/g, "{ ... }").replace(/\s+/g, " ")
  if (!type) {
    if (!patternText(value)) {
      if (SETTINGS.includes(lower)) {
        err(ln, `${lower} is a setting, not a name, so it takes no =: ${lower} ${value}`)
        return null
      }
      if (RENAMED[lower]) {
        err(ln, RENAMED[lower])
        return null
      }
      if (evalNumber(value)) {
        // A number can only be a setting, so this is a misspelt or made-up one.
        const best = closest(lower, SETTINGS)
        err(
          ln,
          best[1] <= 2
            ? `"${name}" isn't a setting. Did you mean ${best[0]}?`
            : `"${name}" isn't a setting. Settings: ${SETTINGS.join(", ")}`,
        )
        return null
      }
    }
    const problem = nameProblem(name, value)
    if (problem) {
      err(ln, problem)
      return null
    }
    // The name still gets defined, so one missing type is one message.
    err(ln, `Say what ${name} is. Put its type in front: ${shape} ${name} = ${shown}`)
    type = shape
  } else if (type === "pattern" && shape !== "pattern") {
    const line = shape === "steps" ? "kick" : "chords"
    err(
      ln,
      `${shown} is ${shape}, not a pattern. Write ${shape} ${name} = ${shown}, ` +
        `or give them an instrument: pattern ${name} = ${line}: ${shown}`,
    )
    return null
  } else if (
    type === "chords" &&
    !lengthPrefix(value).has &&
    tokenize(value).some((t) => blocks?.[t]) &&
    tokenize(value).every(
      (t) => !blocks?.[t] || !blocks[t].lines.some((l) => TRACK_RE.test(l.text)),
    )
  ) {
    // chords verse = { ... } holding chords, not instruments' lines
    err(ln, CHORDS_BLOCK)
    return null
  } else if (type !== shape && patternText(value)) {
    // Anything else that isn't the declared type is said more exactly by defineWord.
    err(ln, `That's a pattern, not ${type}. Write pattern ${name} = ...`)
    return null
  }
  return type === "pattern"
    ? { kind: "blockdef", ln, name, value, blocks }
    : { kind: "word", ln, type, name, value, blocks }
}

// bar 2 { ... }, bar 2 hat.pedal: 4, bars 3 to 4 fill: what plays in those bars of the
// block it's in, and nowhere else. Returns { kind: "placed", from, to, line }, where
// `line` is what plays there, or null after saying what's wrong.
function readPlace(text, { ln, blocks }, err) {
  const many = text.startsWith("bars")
  const nums = numbers(text)
  const first = nums.sumAt(many ? 4 : 3)
  const to = first && many ? /^\s+to\s+/.exec(text.slice(first.end)) : null
  const last = many ? to && nums.sumAt(first.end + to[0].length) : first
  if (!first || !last) {
    err(
      ln,
      many
        ? "bars takes the first and last bar, then what plays there: bars 3 to 4 { ... }"
        : "bar takes the number of a bar, then what plays there: bar 2 { ... }",
    )
    return null
  }
  const [from, until] = [first.e.value, last.e.value]
  if (!Number.isInteger(from) || !Number.isInteger(until) || from < 1 || until > MAX_BARS) {
    err(ln, `Bars are counted from 1, up to ${MAX_BARS}: bar 1, bar 2`)
    return null
  }
  if (until < from) {
    err(ln, `bars ${from} to ${until} runs backwards. The first bar comes first`)
    return null
  }
  const rest = text.slice(last.end).trim()
  const shown = text.slice(0, last.end).trim()
  if (!many && /^to(\s|$)/.test(rest)) {
    err(ln, `For more than one bar, write bars: bars ${from} to ${from + 1} { ... }`)
    return null
  }
  if (!rest) {
    err(ln, `${shown} needs what plays there: ${shown} { ... }`)
    return null
  }
  return { kind: "placed", ln, from, to: until, line: { ln, text: rest, blocks } }
}

// Sorts one line (not play) into a setting, a word, a named pattern ("blockdef"), an
// instrument line ("part"), patterns to play ("sequence") or something in a bar ("placed"). Returns null when the line
// is a mistake, after reporting it. A line's patterns without a name are in `blocks`.
// `st` is the state so far, for the names it has.
function classify({ ln, text, blocks }, err, st) {
  const sections = st.sections
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

  if (PLACE_RE.test(text)) return readPlace(text, { ln, blocks }, err)

  const decl = readDecl(text)
  if (decl) return classifyDecl(decl, { ln, blocks }, err, st)

  const m = TRACK_RE.exec(text)
  if (!m) {
    const tokens = tokenize(text)
    const first = tokens[0] || ""
    const after = tokens.slice(1).join(" ")
    const noEquals = /^(steps|chords|pattern)\s+([A-Za-z][A-Za-z0-9]*)\s+([^=].*)$/.exec(text)
    if (text.startsWith("|")) err(ln, "Put these bars at the end of the line above")
    else if (noEquals && !(noEquals[1] === "chords" && buildChord(noEquals[2], parseKey(st.key)))) {
      const [, type, name, value] = noEquals
      err(ln, `${type} ${name} needs = before what it holds: ${type} ${name} = ${value}`)
    } else if (/^loop\s+[A-Za-z][A-Za-z0-9.]*\s*:/.test(text)) {
      err(ln, NO_LOOP.pattern)
    } else if (/^repeat\b/i.test(text)) err(ln, RENAMED.repeat)
    else if (/^(pattern|section|def)(\s|$)/.test(text)) {
      err(ln, patternHint(text))
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
      // intro verse verse: patterns to play, one after another
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
      "A length goes in front of what it measures: pattern groove = 3 bars {, or play 3 bars { ... }",
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
    return { kind: "part", ln, name, value, drum, art, blocks }
  }
  err(ln, unknownInstrument(name))
  return null
}

// ---------------------------------------------------------------------------
// Parts: what one line plays. In a pattern it repeats until the pattern ends; in a play it
// plays once.
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
        : `"${tok}" isn't defined above. Name it first: chords ${tok} = Am F|C G`,
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
  let ok = true
  for (const t of tokens) {
    const w = st.words[t]
    if (w && w.type !== "chords") {
      err(part.ln, `${t} is ${w.type}, so it goes on a drum's line, not on chords:`)
      ok = false
    } else if (w) expanded.push("|", ...w.tokens, "|")
    else expanded.push(t)
  }
  if (!ok) return null
  const bars = []
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

// The snare's ghost notes have a line of their own, so a ghost note on the snare's main
// line, or an accent or ghost on snare.ghost, is a mistake. Says why, or null.
function ghostLineProblem(part, ghost, accent) {
  if (part.name === "snare" && ghost) {
    return "the snare's ghost notes go on a line of their own: snare.ghost: --x-"
  }
  if (part.art !== "ghost") return null
  if (accent) return "snare.ghost hits are ghost notes, so they can't be accented"
  if (ghost) return "every hit on snare.ghost is a ghost note already, so write x"
  return null
}

// `inst` and `art` pick the sound (ride + bell); `lane` is the line it came from.
function hit(part, tick, mods, kit) {
  const ghost = mods.ghost || part.art === "ghost" // every hit on snare.ghost is one
  return {
    inst: part.drum,
    art: part.art,
    lane: part.name,
    kit,
    tick,
    vel: mods.accent ? 1 : ghost ? 0.3 : 0.7,
    accent: !!mods.accent,
    ghost,
    double: !!mods.double,
    line: part.ln,
  }
}

function pushHit(out, part, tick, mods, doubleGap, kit) {
  const ev = hit(part, tick, mods, kit)
  out.push(ev)
  if (mods.double) out.push({ ...ev, tick: tick + doubleGap, hidden: true, gap: doubleGap })
}

const BEAT_RE = /^(\d+)(e|&|a)?$/
// Whether a line lists beats (2e 4) rather than steps (x-x-). The two never mix.
const listsBeats = (tokens) => tokens.some((t) => /^\d/.test(t))

// A bar of steps the way it's best written, a beat to a group: ---- ---- --X- --
function drawBar(cells, st) {
  const perBeat = TPQ / st.stepTicks
  if (!Number.isInteger(perBeat) || perBeat < 2) return cells.join("")
  const groups = []
  for (let k = 0; k < cells.length; k += perBeat) groups.push(cells.slice(k, k + perBeat).join(""))
  return groups.join(" ")
}

// Beats used to take bar lines, empty bars and steps after a beat (-|3& X). What such a
// line says, written today's way, or null when that isn't simple to say.
function beatsToday(part, tokens, st, barTicks) {
  const stepTicks = st.stepTicks
  if (barTicks % stepTicks) return null
  const letter = { accent: "X", ghost: "g", double: "d" }
  const bars = [] // each bar: its steps, how to write it, and whether anything hits in it
  for (const bar of splitBars(tokens)) {
    if (bar.length === 1 && bar[0] === "%") {
      if (!bars.length) return null
      bars.push(bars[bars.length - 1])
      continue
    }
    const cells = Array(barTicks / stepTicks).fill("-")
    let plain = true
    let at = null
    for (const tok of bar.length === 1 && bar[0] === "-" ? [] : bar) {
      const m = BEAT_RE.exec(tok)
      if (m) {
        const tick = Math.round((Number(m[1]) - 1 + SUB[m[2] || ""]) * TPQ)
        if (Number(m[1]) < 1 || tick >= barTicks || tick % stepTicks) return null
        at = tick / stepTicks
        cells[at] = "x"
      } else if (at != null && (letter[tok] || isStepRun(tok))) {
        const run = letter[tok] || tok
        for (let k = 0; k < run.length && at + k < cells.length; k++) cells[at + k] = run[k]
        at = null
        plain = false
      } else return null
    }
    bars.push({
      cells,
      text: plain ? bar.join(" ") : drawBar(cells, st),
      empty: cells.every((c) => c === "-"),
    })
  }
  const hit = bars.filter((b) => !b.empty)
  if (!hit.length) return null
  // A layer in a block of steps, or steps being named, has no instrument in front
  const line = part.drum && !part.layer ? `${part.name}: ` : ""
  if (bars.length === 1) return line + bars[0].text
  // One bar with something in it: that bar, named
  if (line && hit.length === 1) return `bar ${bars.indexOf(hit[0]) + 1} ${line}${hit[0].text}`
  if (bars.length > 4) return null
  return line + bars.map((b) => drawBar(b.cells, st)).join(" | ")
}

// Beats: crash: 1, snare: 2e 4 — the beats a drum hits on in every bar, counted 1 e & a.
// They're plain hits in one bar, with nothing else on the line: how a hit is played is
// drawn in steps, and what happens in one bar only goes in that bar (bar 2 { ... }).
// Returns the bar's hits ({ tick, mods, tok }) as a list of one bar, or null.
function readBeats(part, tokens, st, barTicks, err) {
  const qpb = barQuarters(st)
  const hits = []
  let ok = true
  const fail = (msg) => {
    err(part.ln, msg)
    ok = false
  }
  for (const tok of tokens) {
    if (!MODIFIERS.includes(tok)) continue
    const problem = ghostLineProblem(part, tok === "ghost", tok === "accent")
    if (problem) {
      fail(`"${tok}": ${problem}`)
      return null
    }
  }
  // Bar lines, empty bars and steps after a beat were ways to write these. Said once, with
  // the line as it's written now.
  const old = (t) =>
    t === "|" ||
    t === "%" ||
    isStepRun(t) ||
    MODIFIERS.includes(t) ||
    st.words[t]?.type === "steps" ||
    !!part.blocks?.[t]
  if (tokens.some(old)) {
    const now = beatsToday(part, tokens, st, barTicks)
    const drum = part.drum ? part.name : "snare"
    fail(
      "Beats are plain hits in one bar, with nothing else on the line. " +
        (now
          ? `Write this as ${now}`
          : `To say how a hit is played, draw the bar in steps (--X-). For one bar only, name it: bar 2 ${drum}: 2 4`),
    )
    return null
  }
  for (const tok of tokens) {
    const m = BEAT_RE.exec(tok)
    const word = st.words[tok]
    if (m) {
      const q = Number(m[1]) - 1 + SUB[m[2] || ""]
      if (Number(m[1]) < 1 || q > qpb - 1e-9) {
        fail(`${tok} is past the end of a ${timeLabel(st)} bar, which ends on ${lastCount(st)}`)
      } else if (hits.some((h) => h.tick === Math.round(q * TPQ))) {
        fail(`${tok} is on this line twice`)
      } else hits.push({ tick: Math.round(q * TPQ), mods: {}, tok })
    } else if (VARIATION_LINE[tok]) {
      fail(`"${tok}" is a line of its own now, e.g. ${VARIATION_LINE[tok]}: 1`)
    } else if (word) {
      fail(`${tok} is ${word.type}, which don't go in a list of beats`)
    } else if (st.sections[tok]) {
      fail(`${tok} is a pattern, so it goes on a line of its own, not on an instrument's line`)
    } else {
      fail(`"${tok}" isn't a beat. Beats look like 1, 2&, 3e or 4a`)
    }
  }
  if (!ok) return null
  hits.sort((a, b) => a.tick - b.tick)
  return [hits]
}

function beatPattern(part, tokens, st, barTicks, err) {
  const bars = readBeats(part, tokens, st, barTicks, err)
  if (!bars) return null
  const stepTicks = st.stepTicks
  return {
    kind: "drum",
    ticks: bars.length * barTicks,
    expand(total, loop) {
      const out = []
      for (let b = 0; b * barTicks < total && (loop || b < bars.length); b++) {
        for (const h of bars[b % bars.length]) {
          if (b * barTicks + h.tick < total)
            pushHit(out, part, b * barTicks + h.tick, h.mods, stepTicks / 2, st.kit)
        }
      }
      return out
    },
  }
}

// The step that hits a drum this way: x, X, g or d (D for an accented double).
function stepLetter(mods) {
  const c = mods.double ? "d" : mods.ghost ? "g" : "x"
  return mods.accent ? c.toUpperCase() : c
}

// Beats written as steps, so they can be named as steps or layered with them: each bar on
// the step grid. Null, after saying why, when the bars or beats aren't on it.
function beatsAsSteps(part, tokens, st, err) {
  const { barTicks } = meterOf(st)
  const bars = readBeats(part, tokens, st, barTicks, err)
  if (!bars) return null
  const stepTicks = st.stepTicks
  if (barTicks % stepTicks) {
    err(
      part.ln,
      `A ${timeLabel(st)} bar isn't a whole number of steps, so these beats can't be steps`,
    )
    return null
  }
  const perBar = barTicks / stepTicks
  const run = Array(bars.length * perBar).fill("-")
  for (let b = 0; b < bars.length; b++) {
    for (const h of bars[b]) {
      if (h.tick % stepTicks) {
        err(part.ln, `${h.tok} isn't on a step, so these beats can't be steps`)
        return null
      }
      run[b * perBar + h.tick / stepTicks] = stepLetter(h.mods)
    }
  }
  return run.join("")
}

const STEP_HELP = "Use x (hit), X (accent), g (ghost), d (double) or - (nothing)"

// One step character → hit modifiers; null for -, undefined when it isn't valid here.
function stepMods(c, part, err, where) {
  if (c === "-") return null
  const mods = { ...STEPS[c.toLowerCase()], accent: c !== c.toLowerCase() }
  const problem = ghostLineProblem(part, mods.ghost, mods.accent)
  if (problem) {
    err(part.ln, `"${c}"${where}: ${problem}`)
    return undefined
  }
  if (mods.accent && mods.ghost) {
    err(part.ln, `"${c}"${where}: a ghost note can't be accented`)
    return undefined
  }
  return mods
}

// Why a | in steps is in the wrong place, after `n` steps, or null if a bar ends there.
function barLineProblem(n, st) {
  const { barTicks } = meterOf(st)
  if ((n * st.stepTicks) % barTicks === 0) return null
  return (
    `This | isn't at the end of a bar: it's after ${count(n, "step")}, ` +
    `and a ${timeLabel(st)} bar is ${count(barTicks / st.stepTicks, "step")}`
  )
}

// Steps: kick: x--x--- — one character per step, each one step long. Spaces are for the
// eye, and so is |, which has to fall where a bar ends.
function stepPattern(part, tokens, st, err) {
  const steps = []
  let ok = true
  const barLine = () => {
    const problem = ok && barLineProblem(steps.length, st)
    if (!problem) return
    err(part.ln, problem)
    ok = false
  }
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
            : `"${tok}" isn't defined above. Name it first: steps ${tok} = x-x-`,
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
    if (tok === "|") {
      barLine()
      continue
    }
    const block = part.blocks?.[tok]
    if (block) {
      const run = stepBlock(block, st, err, part)
      if (run == null) ok = false
      else addRun(run)
      continue
    }
    const w = st.words[tok]
    if (!w) {
      addRun(tok)
      continue
    }
    if (w.type !== "steps") {
      err(part.ln, `${tok} is ${w.type}, so it goes on the chords: line, not on a drum's`)
      ok = false
      continue
    }
    for (const t of w.tokens) t === "|" ? barLine() : addRun(t, tok)
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

// A drum's block of steps, one layer a line: snare.ghost: { --x- / ------------ddd- }.
// The layers play together, each repeating until they all line up again, and where two
// hit the same step the lower line wins. A rest never does, so a layer only changes the
// steps it hits. Returns the steps as one run (--x---x---x-ddd-), or null after saying
// what's wrong. With `part`, each layer is checked as that drum's steps, on its own line.
function stepBlock(block, st, err, part = null) {
  const layers = []
  for (const line of block.lines) layers.push(stepLayer(line, st, err, part))
  if (layers.includes(null)) return null
  const length = layers.reduce((a, r) => lcm(a, r.length), 1)
  if (length * st.stepTicks > MAX_BARS * meterOf(st).barTicks) {
    err(block.ln, `This block's layers only line up again after more than ${MAX_BARS} bars`)
    return null
  }
  let run = ""
  for (let k = 0; k < length; k++) {
    let step = "-"
    for (const r of layers) if (r[k % r.length] !== "-") step = r[k % r.length]
    run += step
  }
  return run
}

// One layer in a block of steps: steps, names of steps or blocks of steps, in a row.
function stepLayer(line, st, err, part) {
  const fail = (msg) => {
    err(line.ln, msg)
    return null
  }
  if (TRACK_RE.test(line.text)) {
    return fail(
      `A block of steps holds steps, one layer a line, like --x-. ${line.text} is an instrument's line, which goes in a pattern`,
    )
  }
  if (listsBeats(tokenize(line.text))) {
    // A layer of beats: 2 4
    const where = {
      name: "steps",
      art: "hit",
      ...part,
      ln: line.ln,
      blocks: line.blocks,
      layer: true,
    }
    return beatsAsSteps(where, tokenize(line.text), st, err)
  }
  const check = (run, where) => {
    if (!part) return true
    const here = { ...part, ln: line.ln }
    return [...run].every((c) => stepMods(c, here, err, where) !== undefined)
  }
  let run = ""
  for (const tok of tokenize(line.text)) {
    const w = st.words[tok]
    if (tok === "|") {
      const problem = barLineProblem(run.length, st)
      if (problem) return fail(problem)
    } else if (line.blocks?.[tok]) {
      const inner = stepBlock(line.blocks[tok], st, err, part)
      if (inner == null) return null
      run += inner
    } else if (w?.type === "steps") {
      const named = w.tokens.filter((t) => t !== "|").join("")
      if (!check(named, ` (in ${tok})`)) return null
      run += named
    } else if (isStepRun(tok)) {
      if (!check(tok, "")) return null
      run += tok
    } else if (w) {
      return fail(`${tok} is ${w.type}, so it can't be a layer of steps`)
    } else if (st.sections[tok]) {
      return fail(`${tok} is a pattern, so it can't be a layer of steps`)
    } else if (tok === "loop") {
      return fail("loop isn't needed: a block's layers repeat until they line up again")
    } else if (/^[a-z][a-z0-9]+$/.test(tok)) {
      return fail(`"${tok}" isn't defined above. Name it first: steps ${tok} = x-x-`)
    } else return fail(`"${tok}" isn't a step. ${STEP_HELP}`)
  }
  return run
}

// One instrument's line. `repeats` says whether it's in a pattern, where lines repeat,
// for saying what to write instead of loop.
function readPart(part, st, barTicks, err, repeats) {
  const tokens = tokenize(part.value)
  if (tokens.includes("loop")) {
    err(part.ln, repeats ? NO_LOOP.pattern : NO_LOOP.play)
    return null
  }
  if (tokens.includes("for")) {
    err(
      part.ln,
      "A length goes in front of what's played, not on one line: play 2 bars { ... }, or pattern groove = 2 bars {",
    )
    return null
  }
  if (part.name === "chords" && tokens.some((t) => BLOCK_KEY.test(t))) {
    err(part.ln, CHORDS_BLOCK)
    return null
  }
  let pattern
  if (part.name === "chords") pattern = chordPattern(part, tokens, st, barTicks, err)
  else if (listsBeats(tokens)) {
    pattern = beatPattern(part, tokens, st, barTicks, err)
  } else pattern = stepPattern(part, tokens, st, err)
  return pattern && { ...pattern, part }
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

// Where something is being played from. In a pattern everything repeats until it ends; in
// a play, lines play once and only patterns repeat.
const blockCtx = (name, ln) => ({
  ln,
  repeats: true,
  where: `in ${name}`,
  what: name,
  sized: `pattern ${name} = 4 bars {`,
})
const playCtx = (ln) => ({ ln, repeats: false, where: "in this play", what: "This play" })
const anonCtx = (ln) => ({
  ln,
  repeats: true,
  where: "in this pattern",
  what: "This pattern",
  sized: "4 bars { ... }",
})
// What plays in a bar is a pattern that lasts that bar.
const placeCtx = (l) => {
  const bars = l.from === l.to ? `bar ${l.from}` : `bars ${l.from} to ${l.to}`
  return { ln: l.ln, repeats: true, where: `in ${bars}`, what: `What's in ${bars}` }
}

// loop is gone: what repeats is decided by where something is.
const NO_LOOP = {
  pattern: "loop isn't needed: everything in a pattern repeats until the pattern ends",
  play:
    "loop isn't needed, but a play's own lines play once. To repeat a line, put it in a " +
    "pattern: pattern beat = { kick: x--- }, then play 4 bars beat",
  sequence:
    "loop isn't needed: a pattern on a line of its own repeats until what it's in ends, " +
    "and a length in front repeats it for that long: 6 bars groove",
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a)
const lcm = (a, b) => (a / gcd(a, b)) * b
const count = (n, word) => `${fmt(n)} ${word}${n === 1 ? "" : "s"}`

// A length the way it's written: 3 bars, 7 steps, 1.5 beats.
function sayTicks(ticks, st, barTicks) {
  if (ticks % barTicks === 0) return count(ticks / barTicks, "bar")
  if (ticks % st.stepTicks === 0) return count(ticks / st.stepTicks, "step")
  return count(ticks / TPQ, "beat")
}

// Anything that repeats has to fit what it's in a whole number of times. Reports each of
// `loops` ({ what, ticks, ln }) that doesn't fit `total` ticks, and where they'd all fit.
// Returns whether they all do.
function checkLoops(loops, total, st, barTicks, err) {
  // A pattern that sets its own tempo can come out at no whole number of ticks here.
  const whole = (l) => l.ticks > 0 && nearWhole(l.ticks)
  const bad = loops.filter((l) => !whole(l) || total % Math.round(l.ticks))
  if (!bad.length) return true
  const every =
    loops.filter(whole).reduce((a, l) => lcm(a, Math.round(l.ticks)), barTicks) / barTicks
  const when = every === 1 ? "every bar" : `every ${fmt(every)} bars`
  const hint =
    loops.length > 1 ? `The things repeating here line up ${when}` : `It lines up ${when}`
  const length = sayTicks(total, st, barTicks)
  for (const l of bad) {
    err(
      l.ln,
      whole(l)
        ? `${l.what} is ${sayTicks(Math.round(l.ticks), st, barTicks)} long, ` +
            `which doesn't fit ${length} a whole number of times. ${hint}`
        : `${l.what} sets its own tempo, and doesn't fit ${length} a whole number of times`,
    )
  }
  return false
}

// `clip` played end to end until `durSec`.
function tile(clip, durSec) {
  const out = { events: [], drumEvents: [], spans: [] }
  const times = Math.round(durSec / clip.durSec)
  for (let k = 0; k < times; k++) {
    const moved = shift(clip, k * clip.durSec, k > 0)
    out.events.push(...moved.events)
    out.drumEvents.push(...moved.drumEvents)
    out.spans.push(...moved.spans)
  }
  return { ...out, durSec }
}

// Plays instrument lines (`parts`) and already-evaluated clips together from the same
// start. `once` clips play once; `repeated` ones ({ clip, what, ln }) repeat to fill. A
// `once` clip that was put in a bar says the last bar it's in (`until`).
// In a pattern (ctx.repeats) the lines repeat too, and without `bars` it lasts until
// everything in it lines up again. In a play the lines play once, and it lasts as long as
// the longest thing in it. Whatever repeats has to fit.
function layer(parts, once, repeated, st, bars, err, ctx) {
  const meter = meterOf(st)
  const { barTicks, secPerTick } = meter
  const read = parts.map((p) => readPart(p, st, barTicks, err, ctx.repeats)).filter(Boolean)
  if (read.length < parts.length) return null
  if (!read.length && !once.length && !repeated.length) return null
  const loops = [
    ...(ctx.repeats
      ? read.map((p) => ({ what: `The ${p.part.name} line`, ticks: p.ticks, ln: p.part.ln }))
      : []),
    ...repeated.map((r) => ({ ...r, ticks: r.clip.durSec / secPerTick })),
  ]
  const placed = once.filter((c) => c.until).sort((a, b) => b.until - a.until)[0]
  const named = placed ? placed.until * barTicks : 0 // through the last bar that's named
  let totalTicks
  if (bars) totalTicks = Math.round(bars * barTicks)
  else if (ctx.repeats) {
    const whole = loops.filter((l) => nearWhole(l.ticks)).map((l) => Math.round(l.ticks))
    totalTicks = whole.reduce(lcm, 1)
    // ...and long enough to have the bars it names
    totalTicks *= Math.max(1, Math.ceil(named / totalTicks))
    if (totalTicks > MAX_BARS * barTicks) {
      err(
        ctx.ln ?? loops[0].ln,
        `What's ${ctx.where} only lines up again after more than ${MAX_BARS} bars. ` +
          `Say how long it is: ${ctx.sized}`,
      )
      return null
    }
  } else {
    totalTicks = Math.max(
      ...read.map((p) => p.ticks),
      ...[...once, ...repeated.map((r) => r.clip)].map((c) => Math.round(c.durSec / secPerTick)),
    )
  }
  if (named > totalTicks) {
    err(
      placed.ln,
      `${ctx.what} is ${sayTicks(totalTicks, st, barTicks)} long, so it has no bar ${placed.until}`,
    )
    return null
  }
  if (!checkLoops(loops, totalTicks, st, barTicks, err)) return null
  const durSec = totalTicks * secPerTick
  const own = read.map((p) => {
    const line = { ln: p.part.ln, events: [], drumEvents: [], spans: [] }
    for (const e of p.expand(totalTicks, ctx.repeats)) {
      if (p.kind === "drum") {
        // A double's second stroke keeps how far it is from the first, to go with it.
        const gap = e.gap ? { gapSec: e.gap * secPerTick } : {}
        line.drumEvents.push({ ...e, secStart: e.tick * secPerTick, ...gap })
      } else line.events.push({ ...e, secStart: e.tick * secPerTick, secDur: e.ticks * secPerTick })
    }
    return line
  })
  const clips = [...once, ...repeated.map((r) => ({ ...tile(r.clip, durSec), ln: r.ln }))]
  // In the order they're written, so what plays at the same moment keeps that order.
  const all = [...own, ...clips].sort((a, b) => a.ln - b.ln)
  const inside = (e) => e.secStart < durSec - 1e-9
  const events = all.flatMap((c) => c.events).filter(inside)
  // A hi-hat can't be open and closed at once, so an open hit replaces a closed one at the
  // same moment. The next hi-hat hit closes it.
  const moment = (e) => Math.round(e.secStart * 1e6)
  const opened = new Set(
    all.flatMap((c) => c.drumEvents.filter((e) => e.lane === "hat.open").map(moment)),
  )
  // Where two lines hit the same drum at the same moment, the lower line wins, as in a
  // block of steps. A rest never does, and a double's second stroke goes with its first.
  const hits = new Map() // drum and moment → the line that won, and its strokes there
  all.forEach((c, from) => {
    for (const e of c.drumEvents) {
      if (!inside(e) || (e.lane === "hat" && opened.has(moment(e)))) continue
      const at = `${e.lane} ${Math.round((e.secStart - (e.gapSec || 0)) * 1e6)}`
      const had = hits.get(at)
      if (had?.from === from) had.strokes.push(e)
      else hits.set(at, { from, strokes: [e] })
    }
  })
  const drumEvents = [...hits.values()].flatMap((h) => h.strokes)
  events.sort((a, b) => a.secStart - b.secStart)
  drumEvents.sort((a, b) => a.secStart - b.secStart)
  // The grid follows the longest sequence, then this block's own bars after it.
  const lead = clips
    .filter((c) => !c.until)
    .reduce((a, c) => (!a || c.durSec > a.durSec ? c : a), null)
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

// Reads a block's lines in order, so each one sees the names given before it. Settings
// and names are applied to `st`; `named` is called with each pattern that gets a name.
function readLines(lines, st, err, named) {
  const read = []
  for (const line of lines) {
    const l = classify(line, err, st)
    if (!l) continue
    read.push(l)
    if (l.kind === "setting") applySetting(l.name, l.value, l.ln, st, err)
    else if (l.kind === "word") defineWord(l.type, l.name, l.value, l.ln, st, err, l.blocks)
    else if (l.kind === "blockdef") {
      const sec = defineBlock(l, st, err)
      if (sec && named) named(sec)
    }
  }
  return read
}

// What something that repeats is called when it doesn't fit.
const loopName = (it) => it.name || (it.items ? "This group" : "This pattern")

// Each instrument has one line in a block. A drum's layers go in a block on that line;
// chords play one at a time.
const secondLine = (name, where) =>
  name === "chords"
    ? `chords already has a line ${where}. Chords play one at a time, so put them all on one line`
    : `${name} already has a line ${where}. To layer it, put its lines in a block: ${name}: { ... }`

// Lines in braces are one block: they play together, and what's defined inside stays
// inside. `bars` is the length written in front of the block, if any. In a pattern every
// line repeats; in a play a line of patterns repeats only when it's one pattern on its own.
// What's put in a bar (bar 2 { ... }) plays there once each time through the block.
function blockClip(lines, state, err, ctx, stack, bars = 0) {
  const st = cloneState(state)
  const read = readLines(lines, st, err)
  const parts = []
  for (const l of read) {
    if (l.kind !== "part") continue
    if (parts.some((p) => p.name === l.name)) {
      err(l.ln, secondLine(l.name, ctx.where))
      continue
    }
    parts.push(l)
  }
  const once = []
  const repeated = []
  for (const l of read) {
    if (l.kind !== "sequence") continue
    const clip = sequenceClip(l.items, st, err, l.ln, stack)
    if (!clip) return null
    const what = l.items.length === 1 ? loopName(l.items[0]) : "This line"
    if (ctx.repeats || l.items.length === 1) repeated.push({ clip, what, ln: l.ln })
    else once.push({ ...clip, ln: l.ln })
  }
  for (const l of read) {
    if (l.kind !== "placed") continue
    // What's in a bar repeats to fill it, and plays once each time through this block.
    const clip = blockClip([l.line], st, err, placeCtx(l), stack, l.to - l.from + 1)
    if (!clip) return null
    const { barTicks, secPerTick } = meterOf(st)
    const at = (l.from - 1) * barTicks * secPerTick
    once.push({ ...shift(clip, at, false), durSec: at + clip.durSec, ln: l.ln, until: l.to })
  }
  if (!parts.length && !once.length && !repeated.length) {
    // A line that's already been reported as a mistake doesn't need this too.
    if (lines.length && read.length === lines.length) {
      err(lines[0].ln, `Nothing to play ${ctx.where}`)
    }
    return null
  }
  return layer(parts, once, repeated, st, bars, err, ctx)
}

// Plays a pattern, with or without a name, with the settings in effect where it's played.
function sectionClip(sec, state, err, ln, stack) {
  if (sec.anon) return blockClip(sec.lines, state, err, anonCtx(sec.ln), stack, sec.bars)
  if (stack.includes(sec.name)) {
    err(ln, `${sec.name} plays itself, so it would never end`)
    return null
  }
  return blockClip(sec.lines, state, err, blockCtx(sec.name, ln), [...stack, sec.name], sec.bars)
}

function undefinedName(name, st) {
  if (/^x\d+$/.test(name)) return "To repeat, put a length in front: 4 bars groove"
  const word = st.words[name]
  if (word) {
    return word.type === "steps"
      ? `${name} is steps, so it goes on a drum's line: hat: ${name}`
      : `${name} is chords, so it goes on the chords line: chords: ${name}`
  }
  const names = Object.keys(st.sections)
  return names.length
    ? `"${name}" isn't defined. Patterns so far: ${names.join(", ")}`
    : `"${name}" isn't defined. Name it first: pattern ${name} = { ... }`
}

// Checks a pattern when it's defined, so its mistakes show even if it's never played.
// `owner` is the pattern a block without a name sits in, if any.
function checkSection(sec, state, err, owner = sec.anon ? null : sec.name) {
  const where = sec.anon ? "this pattern" : sec.name
  const st = cloneState(state)
  const read = readLines(sec.lines, st, err, (named) => checkSection(named, st, err))
  const parts = read.filter((l) => l.kind === "part")
  parts.forEach((l, i) => {
    if (parts.slice(0, i).some((p) => p.name === l.name)) {
      err(l.ln, secondLine(l.name, `in ${where}`))
    }
    readPart(l, st, meterOf(st).barTicks, err, true)
  })
  const names = (items, ln) => {
    for (const it of items) {
      if (it.items) names(it.items, ln)
      else if (it.block) checkSection(it.block, st, err, owner)
      else if (it.name === owner) err(ln, `${owner} plays itself, so it would never end`)
      else if (!st.sections[it.name]) err(ln, undefinedName(it.name, st))
    }
  }
  for (const l of read) {
    if (l.kind === "sequence") names(l.items, l.ln)
    // What's in a bar is a pattern of its own
    else if (l.kind === "placed") {
      checkSection({ anon: true, ln: l.ln, lines: [l.line], bars: 0 }, st, err, owner)
    }
  }
  // A line that's already been reported as a mistake doesn't need this too.
  const playable = read.some((l) => ["part", "sequence", "placed"].includes(l.kind))
  if (!playable && read.length === sec.lines.length) {
    err(sec.ln, sec.anon ? "This pattern has nothing to play" : `${sec.name} has nothing to play`)
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

// intro verse 8 bars (verse chorus) → items in playing order. Each is a name, a pattern
// without a name ({#1}, kept in `blocks`) or a bracketed group, with the length in front
// of it, if any, which it repeats to fill. Lengths are arithmetic: (1+2) bars groove.
function readSequence(line, ln, err, blocks = {}) {
  const text = line.trim()
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
        const last = out[out.length - 1]
        fail(
          "* only multiplies numbers. To repeat, put a length in front: " +
            `4 bars ${last?.name || (last?.items ? "( ... )" : last ? "{ ... }" : "groove")}`,
        )
        break
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
          fail(`${text} of what? Put a pattern or its name after it`)
          break
        }
        bars = len.bars
        i = text.length - len.rest.length
      }
      if (text[i] === "(") {
        i++
        out.push({ items: items(true), bars })
        continue
      }
      const key = /^\{#\d+\}/.exec(text.slice(i))
      if (key && blocks?.[key[0]]) {
        i += key[0].length
        out.push({ block: blocks[key[0]], bars })
        continue
      }
      const name = /^[A-Za-z][A-Za-z0-9]*/.exec(text.slice(i))
      if (!name) {
        const tok = text.slice(i).split(/\s/)[0]
        fail(
          /^\d/.test(tok)
            ? `"${tok}" needs bars after it, e.g. 3 bars groove`
            : `"${tok}" doesn't belong here. This line takes patterns' names, ` +
                "a length in front (4 bars groove), and ( ) to group",
        )
        break
      }
      if (/^x\d+$/.test(name[0])) {
        fail(undefinedName(name[0], {}))
        break
      }
      if (name[0] === "loop") {
        fail(NO_LOOP.sequence)
        break
      }
      i += name[0].length
      out.push({ name: name[0], bars })
    }
    return out
  }
  const seq = items(false)
  return ok ? seq : null
}

// Patterns in a row, one after another. A length in front of one repeats it for that long.
function sequenceClip(items, state, err, ln, stack = []) {
  let t = 0
  const out = { events: [], drumEvents: [], spans: [] }
  const seen = new Set()
  for (const it of items) {
    const sec = it.items ? null : it.block || state.sections[it.name]
    if (!it.items && !sec) {
      err(ln, undefinedName(it.name, state))
      return null
    }
    let clip = it.items
      ? sequenceClip(it.items, state, err, ln, stack)
      : sectionClip(sec, state, err, ln, stack)
    if (!clip) return null
    if (it.bars) {
      const what = loopName(it)
      clip = layer([], [], [{ clip, what, ln }], state, it.bars, err, playCtx(ln))
      if (!clip) return null
    }
    const moved = shift(clip, t, it.name != null && seen.has(it.name))
    out.events.push(...moved.events)
    out.drumEvents.push(...moved.drumEvents)
    out.spans.push(...moved.spans)
    t += clip.durSec
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
  // Returns its lines, the index of its last line, what follows the closing }, and whether
  // a line was left out as a mistake.
  // A block inside it without a name plays where it's written, like a pattern's name:
  // on its line it becomes {#1}, and the line keeps the block in `blocks`.
  // With `oneLine`, reads a single line instead (the rest of a play), through the line
  // where its last block closes.
  const readBlock = (at, rest, what, oneLine = false) => {
    const body = []
    let i = at
    let text = rest
    let cur = null // the line being read: { ln, text, blocks }
    let dropped = false // whether a line was left out as a mistake
    const flush = () => {
      const t = cur ? cur.text.trim() : ""
      if (t && /^play(\s|$)/.test(t)) {
        err(cur.ln, "play goes at the top, not inside braces")
        dropped = true
      } else if (t) body.push({ ...cur, text: t })
      cur = null
    }
    for (;;) {
      cur ??= { ln: lines[i].ln, text: "", blocks: null }
      const brace = /[{}]/.exec(text)
      if (!brace) {
        cur.text += text
        flush()
        if (oneLine) return { body, end: i, tail: "", dropped }
        if (++i >= lines.length) {
          err(lines[at].ln, `${what} needs a } to close it`)
          return { body, end: i, tail: "", dropped }
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
        return { body, end: i, tail: text.trim(), dropped }
      }
      // A block inside this one
      const head = cur.text.trim()
      // What to call it if it isn't closed: the name it's given, when that's what this is
      const inner = readBlock(i, text.trim(), oneLine && what && what !== "play" ? what : "This {")
      if (inner.end >= lines.length) {
        flush()
        return { body, end: inner.end, tail: "", dropped }
      }
      i = inner.end
      text = inner.tail
      if (/^play(\s|$)/.test(head)) {
        err(cur.ln, "play goes at the top, not inside braces")
        cur.text = ""
        dropped = true
      } else if (/^(pattern|section|def)(\s|$)/.test(head) && !TYPED_RE.test(head)) {
        err(cur.ln, patternHint(head))
        cur.text = ""
        dropped = true
      } else if (!inner.body.length) {
        // Unless what was in them was a mistake, already reported
        if (!inner.dropped) err(cur.ln, "These braces have nothing in them")
        cur.text = ""
        dropped ||= inner.dropped
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
    // section groove { and def groove {: older ways to name a pattern
    if (
      /^(section|def)(\s|$)/.test(text) ||
      /^pattern(\s+[A-Za-z][A-Za-z0-9]*)?\s*(=.*)?$/.test(text)
    ) {
      if (!TYPED_RE.test(text)) {
        err(ln, patternHint(text))
        i = /\{/.test(text) ? readBlock(i, text, "", true).end : i
        continue
      }
    }

    if (/^play\s*[:=]/.test(text)) {
      err(
        ln,
        /^play\s*=/.test(text)
          ? "play is a keyword, not a name, so it takes no =: play { ... }"
          : "play is a keyword, not an instrument, so it takes no colon: play groove",
      )
      i = skipIfOpen(i)
      continue
    }

    const play = /^play(?:\s+(.*))?$/.exec(text)
    if (play) {
      // play plays what's after it: a block in braces, or one line. play groove and
      // play { groove } are the same thing.
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
            ? `${text} of what? Put a pattern or its name after it: ${text} { ... }`
            : "play needs something after it: play groove, or play { ... }",
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
          // play { ... } outro: the block is one of the things played in a row
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
        err(ln, "This plays for over 10 minutes. Use a shorter length")
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

    // steps pair = X-x-, chords verse = Am F, pattern groove = 3 bars { ... }: a name.
    // Read here because a pattern's braces can run over several lines.
    let decl = readDecl(text)
    // pattern groove { without its =: said once, and still named, so nothing else breaks
    const noEquals = !decl && /^pattern\s+([A-Za-z][A-Za-z0-9]*)\s+(.+)$/.exec(text)
    if (noEquals) {
      err(ln, patternHint(text))
      decl = { type: "pattern", name: noEquals[1], value: noEquals[2].trim() }
    }
    if (decl) {
      let blocks = null
      if (decl.value.includes("{")) {
        const read = readBlock(i, decl.value, decl.name, true)
        i = read.end
        const line = read.body[0]
        if (!line) continue // its braces were a mistake, already reported
        noteCapo(read.body)
        for (const b of Object.values(line.blocks || {})) noteCapo(b.lines)
        const after = /^\{#\d+\}\s+(?:for\s+)?(\S+)\s+bars?$/.exec(line.text)
        if (after) {
          err(
            ln,
            `A length goes in front of what it measures: pattern ${decl.name} = ${after[1]} bars {`,
          )
          continue
        }
        decl.value = line.text
        blocks = line.blocks
      }
      const l = classifyDecl(decl, { ln, blocks }, err, state)
      if (!l) continue
      if (l.kind === "word") defineWord(l.type, l.name, l.value, ln, state, err, l.blocks)
      else {
        const sec = defineBlock(l, state, err)
        if (sec) checkSection(sec, state, err)
      }
      continue
    }
    const bare = /^([A-Za-z][A-Za-z0-9]*)\s*\{/.exec(text)
    if (bare) {
      err(ln, `${bare[1]} needs a type and = to name its braces: pattern ${bare[1]} = {`)
      i = skipIfOpen(i)
      continue
    }
    // bar 2 { ... } on its own: it says where in a pattern or play, so it goes inside one
    if (PLACE_RE.test(text)) {
      err(
        ln,
        `${text.replace(/\{.*$/, "{ ... }")} goes inside a pattern or a play, to say where in it`,
      )
      i = /\{/.test(text) ? readBlock(i, text, "", true).end : i
      continue
    }
    // { ... } or 3 bars { ... } on its own: a block, but nothing plays it
    if (lengthPrefix(text).rest.startsWith("{")) {
      err(
        ln,
        `Nothing plays this pattern. Put play in front: play ${text.replace(/\{.*$/, "{ ... }")}`,
      )
      i = readBlock(i, text, "", true).end
      continue
    }

    const l = classify({ ln, text }, err, state)
    if (!l) continue
    if (l.kind === "setting") {
      if (applySetting(l.name, l.value, ln, state, err)) {
        setHere.set(l.name, ln)
        if (l.name === "capo" && state.capo > 0) capoLine ??= ln
      }
    } else if (l.kind === "part") {
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
