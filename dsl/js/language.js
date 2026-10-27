/* The music-cell language. A cell is a script, read top to bottom. Every line starts by
   saying what it is:
     set tempo 90             a setting: set, then the setting and its value (set time
                              7 over 8, set key D, set mode dorian), from its line to the
                              end of the cell and into later cells. Only at the top.
     with octave 2 { }        settings for a block only, restored at its }: with key E,
                              mode minor { ... }. At the top it holds statements; inside a
                              play or a pattern it is a block, played with those settings.
     steps pair = ^-x-        a name, with its type in front. There are four types:
     notes riff = E---F# E-E--  steps (a drum's hits), notes, chords, and pattern (lines
     chords verse = Am E7|G D   in braces that play together). A name only ever holds
     pattern groove = { }       its type, and only goes where that type goes.
     kick: x--x---            inside braces, an instrument and what it plays. The colon
     guitar: E---F# E-E--     only ever means this. A drum takes steps (or beats: 1 2& 3).
     piano: chords Am F|C G   A pitched instrument takes notes, drawn on the same steps
                              with the note where a drum has its x (two notes never
                              touch: F# E), or a chart of chords with chords in front.
                              A note is a letter (E2) or a degree of the key, counted
                              on the major scale of its root (1 2 b3, 1' an octave up).
                              Lines play together, so two drums on
                              one step is two lines. Each instrument has one line in a
                              block; to layer it, its line takes a block of its own.
     play { }                 plays what's after it, a pattern or one line, and gives one
                              output with a player and a drum grid. Nothing plays unless
                              it's inside a play.
     bar 2 { }                what plays in bar 2 of what it's in, and nowhere else. One
                              line needs no braces (bar 2 crash: 1), and bar 3 to 4 { }
                              takes a run of bars.
     every 3 steps { }        what plays at that pace: inside, one step lasts 3 steps. A step
                              is a 16th note otherwise. every 1/3 beats { } is triplets.
   A pattern is a loop: everything in it repeats until the pattern ends, and without a
   length it lasts until its lines line up again. A play is a timeline: its own lines play
   once, and a pattern on a line of its own repeats until the play ends. Braces hold what
   plays together and brackets what plays in order: (intro { snare: ---- dddd } 2 bars verse)
   plays them one after another, and two things on one line outside brackets are a
   mistake. A length goes in front of what it measures,
   and a pattern given a length repeats for that long: pattern groove = 3 bars {,
   play 6 bars groove. Anything that repeats has to fit what it's in a whole number of
   times, and a value written as the same figure twice is a mistake (x-x- is x-), since
   the pattern repeats it. A line that starts with | continues the line above.
   On a drum's line a length measures rest or steps, in steps, beats or bars, and on a
   pitched instrument's it holds one note; commas separate the line's parts:
   2 beats rest, dd, 1 beats rest · 3 beats C2, 1 beats rest. The length ... is
   what's left of the block the line is in: -xx, ...rest plays those hits once each time
   through and then nothing, -xx, ...x- plays them and then x- to the end, and either
   way the line has no length of its own, so the other lines decide how long the block
   is. Lengths are always
   plural (1 bars), so bars only ever says how long and bar only ever says which.
   Every number is arithmetic: (1+2) bars groove, set tempo 60*2. So * and / only ever do
   arithmetic, and a time is two numbers (7 over 8), not a fraction.
   { } is a block: what's in it evaluates to one value, played together. Usually that's a
   pattern; after a drum's colon it's that drum's steps, one layer a line, which repeat
   until they line up again, and after a pitched instrument's colon it's what that
   instrument plays at once. In a block, where two lines hit the same drum at the same
   moment, the lower line wins, and a rest never does.
   What's named inside braces stays inside, and a with's settings stay inside its block.
   // starts a comment. Blank lines and indentation mean nothing. Settings set at the top,
   and names, carry on into later cells.
   Pure (no audio), so the notebook can also use it to pass state from cell to cell. */
import { buildChord, isRoman, parseKey } from "./chords.js"
import {
  DRUMS,
  KITS,
  LANES,
  MODES,
  PARTS,
  PITCHED,
  SETTING_EXAMPLE,
  SETTINGS,
  SOUNDS,
  SPLIT,
  TYPES,
} from "./vocab.ts"
import {
  TPQ,
  checkLoops,
  evalNumber,
  fmt,
  lcm,
  lengthAt,
  lengthPrefix,
  MAX_BARS,
  meterOf,
  nearWhole,
  numbers,
  sayTicks,
  singularLength,
  sumTerms,
  swingWarp,
} from "./time.ts"
import { message } from "./diagnostics.ts"
import { cloneState, describe, initialState } from "./state.ts"
import { CHORD_MARKS, chartRepeat, dimMarkProblem, ofChord } from "./values/chart.ts"
import {
  BEAT_RE,
  beatPattern,
  beatsAsSteps,
  EUCLID_RE,
  isStepRun,
  listsBeats,
  STEP_HELP,
  stepBlock,
  stepParts,
  stepPattern,
  STICKING_HELP,
  STICKING_RE,
  stickingPattern,
  tokenize,
} from "./values/steps.ts"
import {
  drawsNotes,
  joinOf,
  noteParts,
  noteSteps,
  notesTouch,
  notNotes,
  ofShown,
  pitchedPattern,
  spacedNotes,
  spaceNotes,
} from "./values/notes.ts"

// Time, ticks and lengths are in time.ts; these are re-exported for code that imports them
// from here.
export { TPQ, barQuarters, lastCount, timeLabel } from "./time.ts"
export { initialState } from "./state.ts"
// The language's words are listed once, in vocab.ts. These are re-exported for code that
// imports them from here.
export {
  DRUMS,
  KITS,
  LANES,
  MODES,
  PARTS,
  PITCHED,
  SETTINGS,
  SOUNDS,
  SPLIT,
  TYPES,
  UNITS,
  VARIATIONS,
} from "./vocab.ts"
export const KEYWORDS = [
  ...TYPES,
  "play",
  "set",
  "with",
  "of",
  "bars",
  "beats",
  "bar",
  "to",
  "every",
  "rest",
  "over",
  "in",
]

const MAX_SECONDS = 600
const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii"]
// A token that reads as a name: a lowercase letter, then letters and digits (riff, partA)
export const NAME_LIKE = /^[a-z][A-Za-z0-9]+$/
const TAKEN = new Set([...SETTINGS, ...DRUMS, ...PARTS, ...KEYWORDS])
// A block written inside a line: {#1} on the line, and the block in the line's `blocks`.
export const BLOCK_KEY = /^\{#\d+\}$/
export const CHORDS_BLOCK =
  "Chords play one at a time, so they can't be layered in a block. Put them on one line: piano: chords Am F|C G"
const NOTES_BLOCK =
  "A name holds one line of notes. Notes that play together go in a block on the instrument's line: piano: { ... }"

const LINE_SHAPES =
  "Each line is a setting (set tempo 90), a name with its type (chords verse = Am F, " +
  "pattern groove = { ... }), play, or inside braces an instrument and what it plays " +
  "(kick: x--x---, guitar: F---G---) or patterns to play (intro verse)"

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
  // The closed hi-hat is the plain one, which is what most people reach for first
  if (/^hat\.(close|closed|shut)$/.test(name)) {
    return "The closed hi-hat is hat on its own; hat.open is the open one, and hat.pedal the foot"
  }
  if (SPLIT.includes(name)) {
    const lanes = LANES.filter((l) => l.startsWith(name + "."))
    return `"${name}" isn't a drum. The ${name}s are ${lanes.slice(0, -1).join(", ")} and ${lanes.at(-1)}`
  }
  if (name.includes(".")) {
    const drum = name.split(".")[0]
    if (PITCHED.includes(drum)) {
      const sounds = PITCHED.filter((p) => p.startsWith(drum + "."))
      return sounds.length
        ? `"${name}" isn't an instrument. ${drum}'s other sound is ${sounds.join(", ")}`
        : `"${name}" isn't an instrument. ${drum} has one sound: ${drum}: F---G---`
    }
    const close = LANES.find((l) => l.includes(".") && editDistance(name, l) <= 2)
    if (close) return `"${name}" isn't a drum. Did you mean ${close}?`
    if (SPLIT.includes(drum)) {
      const lanes = LANES.filter((l) => l.startsWith(drum + "."))
      return `"${name}" isn't a drum. The ${drum}s are ${lanes.slice(0, -1).join(", ")} and ${lanes.at(-1)}`
    }
    const second = LANES.filter((l) => l.includes(".") && !SPLIT.includes(l.split(".")[0]))
    return `"${name}" isn't a drum. Drums with a second sound: ${second.join(", ")}`
  }
  const best = closest(name, PARTS)
  if (best[1] <= 2) return `"${name}" isn't an instrument. Did you mean ${best[0]}?`
  return `"${name}" isn't an instrument. Instruments: ${PARTS.join(", ")}`
}

// Why `name` can't be defined, or null if it can.
function nameProblem(name, value) {
  const n = name.toLowerCase()
  if (PARTS.includes(n)) {
    const pitched = PITCHED.includes(n)
    // guitar = Am F: a chart, which has chords in front of it on the instrument's line
    const chart =
      pitched && tokenize(value).some((t) => !noteSteps(t) && buildChord(t, parseKey("C")))
    const plays = value.startsWith("{")
      ? pitched
        ? "F---G---"
        : "x--x---"
      : (chart ? "chords " : "") + value
    return `${n} is an instrument, so it takes a colon: ${n}: ${plays}`
  }
  if (TAKEN.has(n) || /^x\d+$/.test(name))
    return `${name} already means something, so pick another name`
  if (/^d\d+[ea]?$/.test(name)) return `${name} is a double on a beat, so pick another name`
  return null
}

// The rule for a name of any type: a lowercase letter, then letters and digits, with a capital
// for each new word (partA, countIn); at least two characters, since single letters are
// steps; not a numeral; and not a name already in scope, carried in from a cell above or
// not, with other capitals (partA, then parta). The message, or null.
function nameRule(type, name, st) {
  if (!/^[a-z]/.test(name)) return `Names start with a lowercase letter: ${type} ${name[0].toLowerCase()}${name.slice(1)}`
  if (name.length < 2) return "Names need at least two characters, because single letters are steps"
  if (ROMAN.includes(name)) return `${name} is a chord, so pick another name`
  // A name is defined once in a cell: not again, and not inside a block when it's defined
  // outside it. A name from a cell above can be defined again here.
  const same = st.words[name] || st.sections[name]
  if (same && !same.above) return message("name.defined", { name, line: same.line ?? same.ln })
  const twin = [...Object.keys(st.words), ...Object.keys(st.sections)].find(
    (n) => n !== name && n.toLowerCase() === name.toLowerCase(),
  )
  return twin ? `${name} differs from ${twin} only in its capitals, so pick another name or write ${twin}` : null
}

// pattern groove 3 bars {: a pattern without its =.
function patternHint(text) {
  const m = /^pattern\s+([A-Za-z][A-Za-z0-9]*)\s*([^{=]*)/.exec(text)
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

// The key and mode as one name, for headers: E minor, C major.
export const keyName = (s) => `${s.key} ${s.mode}`

// The key a state is in, as the chords and the sheet read it.
export const keyOf = (st) => parseKey(st.key, st.mode)

// A key is a note, and the mode a setting of its own. Why `value` isn't a key, as the line
// to write after `verb` (set, or with in a with's header).
function keyProblem(value, verb) {
  const both = /^([A-G][#b]?)(?:(m)|\s*([A-Za-z]+))$/.exec(value)
  const mode = both && (both[2] ? "minor" : both[3].toLowerCase())
  if (both && MODES.includes(mode)) return message("key.withMode", { verb, root: both[1], mode })
  if (both) return message("key.notAMode", { verb, root: both[1] })
  return message("key.notANote", { verb })
}

// A with in an instrument's block, among its layers: it goes around the line instead.
export const withInLayers = (name) => message("with.inLayers", { name })

// Applies a setting to `state`. `verb` is how it was written, set or with, for messages.
// Returns whether it was one.
function applySetting(name, value, ln, state, err, verb = "set") {
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
          ? message("time.division", {
              verb,
              value,
              n: num.value,
              count: divided[1].replace(/^\((.*)\)$/, "$1"),
              unit: divided[2],
            })
          : message("time.shape", { verb }),
      )
      return false
    }
    const groups = sumTerms(count)
    if (!groups) {
      err(ln, message("time.count"))
      return false
    }
    if (![1, 2, 4, 8, 16].includes(unit.value)) {
      err(ln, message("time.unit"))
      return false
    }
    if (count.value / unit.value > 8) {
      err(ln, message("time.tooLong"))
      return false
    }
    state.groups = groups
    state.unit = unit.value
    return true
  }
  if (name === "tempo") {
    if (!num || !(num.value >= 20 && num.value <= 400)) {
      err(ln, message("tempo.range"))
      return false
    }
    state.tempo = num.value
    return true
  }
  if (name === "swing") {
    const n = whole(50, 75)
    if (n == null) {
      err(ln, message("swing.range", { verb }))
      return false
    }
    state.swing = n
    return true
  }
  if (name === "key") {
    // The root that degrees and numerals count from. The mode is its own setting, so
    // setting one keeps the other.
    if (!parseKey(value)) {
      err(ln, keyProblem(value.trim(), verb))
      return false
    }
    state.key = value.trim()
    return true
  }
  if (name === "mode") {
    // How the key is written: its signature, and how accidentals are spelt. It changes no
    // pitch, since degrees and numerals count on the major scale of the root.
    if (!MODES.includes(value)) {
      err(
        ln,
        MODES.includes(value.toLowerCase())
          ? message("mode.lowercase", { verb, mode: value.toLowerCase() })
          : message("mode.unknown"),
      )
      return false
    }
    state.mode = value
    return true
  }
  if (name === "transpose") {
    // Every pitched instrument sounds that many semitones from what's written: the chart
    // and the notes stay as written, so a guitar's C shape under set transpose 4 is a capo
    // at the 4th fret. Drums have no pitch, so it leaves them alone.
    const n = whole(-12, 12)
    if (n == null) {
      err(ln, message("transpose.range", { verb }))
      return false
    }
    state.transpose = n
    return true
  }
  if (name === "octave") {
    const n = whole(1, 6)
    if (n == null) {
      err(ln, message("octave.range"))
      return false
    }
    state.octave = n
    return true
  }
  if (name === "kit") {
    if (!KITS.includes(value)) {
      err(ln, message("kit.unknown"))
      return false
    }
    state.kit = value
    return true
  }
  if (SOUNDS[name]) {
    if (!SOUNDS[name].includes(value)) {
      err(ln, message("sound.unknown", { name }))
      return false
    }
    if (value === SOUNDS[name][0]) delete state.sounds[name]
    else state.sounds[name] = value
    return true
  }
  return false
}

// steps name = ^-x-, chords name = Am E7|G D: steps or chords to hand to an instrument.
// What's written has to be the type that's declared.
function defineWord(type, name, value, ln, state, err, blocks = null) {
  const problem = nameProblem(name, value) || nameRule(type, name, state)
  if (problem) return err(ln, problem)
  if (type === "sticking") {
    // sticking para = RLRR LRLL: a hand for each step
    const tokens = []
    for (const t of tokenize(value)) {
      const w = state.words[t]
      if (t === "|" || STICKING_RE.test(t)) tokens.push(t)
      else if (w?.type === "sticking") tokens.push(...w.tokens)
      else if (w) return err(ln, `${t} is ${w.type}, so it can't go in a sticking`)
      else return err(ln, `"${t}" isn't a sticking. ${STICKING_HELP}`)
    }
    if (!tokens.length) return err(ln, `sticking ${name} = needs something after the =`)
    delete state.sections[name]
    state.words[name] = { type, tokens, line: ln }
    return
  }
  if (type === "notes") {
    // notes riff = E---F# E-E--: one line of notes, drawn on the steps, with any lengths
    // written out as the steps they hold
    const parts = noteParts(value, state, err, ln, null)
    if (!parts) return
    if (parts.open) {
      return err(
        ln,
        `A name's notes have a length of their own. ... is the rest of a block, so it goes on the instrument's line: piano: ${name}, ...rest`,
      )
    }
    const tokens = []
    for (const t of parts.tokens) {
      const w = state.words[t]
      if (blocks?.[t]) return err(ln, NOTES_BLOCK)
      else if (w && w.type !== "notes") {
        return err(ln, `${t} is ${w.type}, so it can't go in notes`)
      } else if (w) tokens.push(...w.tokens)
      else if (noteSteps(t) && spacedNotes(t)) return err(ln, notesTouch(t, spacedNotes(t)))
      else if (t === "|" || noteSteps(t)) tokens.push(t)
      else if (isStepRun(t)) {
        return err(
          ln,
          `"${t}" is steps, and ${name} is notes. For steps, write steps ${name} = ${value}`,
        )
      } else return err(ln, notNotes(t, state, "guitar", `chords ${name} = ${value}`))
    }
    if (!tokens.length) return err(ln, `notes ${name} = needs something after the =`)
    delete state.sections[name]
    state.words[name] = { type, tokens, line: ln }
    return
  }
  // Steps can be written with lengths (2 beats rest, dd), which come back as steps
  let written
  if (type === "steps") {
    if (blocks && !BLOCK_KEY.test(value.trim())) {
      const fig = name === "fig" ? "part" : "fig"
      return err(ln, blockBeside(`${name} holds`, (f) => `steps ${name} = x--- ${f}`, fig))
    }
    const parts = stepParts(value, blocks, state, err, ln)
    if (!parts) return
    if (parts.toEnd) {
      return err(
        ln,
        `A name's steps have a length of their own. ... is the rest of a block, so it goes on the drum's line: snare: ${name}, ...rest`,
      )
    }
    written = parts.tokens
  } else written = tokenize(value)
  if (type === "steps" && listsBeats(written)) {
    // steps backbeat = 2 4: beats, as steps
    const run = beatsAsSteps({ name, art: "hit", ln, blocks }, written, state, err)
    if (run == null) return
    delete state.sections[name]
    // A list of beats is a bar long by type, so it's never a repeat of a shorter figure
    state.words[name] = { type, tokens: [run], line: ln, beats: true }
    return
  }
  const key = keyOf(state)
  const tokens = []
  for (const t of written) {
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
    } else if (
      type === "steps" ? isStepRun(t) || t === "|" : CHORD_MARKS.includes(t) || buildChord(t, key)
    ) {
      tokens.push(t)
    } else if (NAME_LIKE.test(t) && !isRoman(t) && !/^[-xd]+$/.test(t)) {
      return err(ln, `"${t}" isn't defined above. Name it first: ${type} ${t} = ...`)
    } else if (type === "chords" && t.includes("@")) {
      const of = ofChord(t, key, state.octave)
      if (of.error) return err(ln, of.error)
      tokens.push(t)
    } else if (drawsNotes(t)) {
      return err(
        ln,
        `"${t}" is notes, and ${name} is ${type}. For notes, write notes ${name} = ${spaceNotes(value)}`,
      )
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
          : dimMarkProblem(t) || `"${t}" isn't a chord I know`,
      )
    }
  }
  if (!tokens.length) return err(ln, `${type} ${name} = needs something after the =`)
  const again = type === "chords" && chartRepeat(tokens)
  if (again) {
    return err(ln, `${name} repeats ${again}. Write chords ${name} = ${again}: a pattern repeats it`)
  }
  delete state.sections[name]
  state.words[name] = { type, tokens, line: ln }
}

// ---------------------------------------------------------------------------
// Reading lines
// ---------------------------------------------------------------------------

const DEF_RE = /^([A-Za-z][A-Za-z0-9]*)\s*=\s*(.*)$/
// A type, a name and what it holds: steps pair = ^-x-
const TYPE_WORDS = TYPES.join("|")
const TYPED_RE = new RegExp(`^(${TYPE_WORDS})\\s+([A-Za-z][A-Za-z0-9]*)\\s*=\\s*(.*)$`)
// The same with the = left out: steps pair ^-x-
const NO_EQUALS_RE = new RegExp(`^(${TYPE_WORDS})\\s+([A-Za-z][A-Za-z0-9]*)\\s+([^=].*)$`)
export const TRACK_RE = /^([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)?)\s*:\s*(.*)$/
// bar 2 ..., bar 3 to 4 ...: a place in front of what plays there
const PLACE_RE = /^bar(\s+\S|$)/
// every 3 steps ...: how long a step lasts, in front of what plays at that pace
const EVERY_RE = /^every(\s|$)/

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
  if (len.has || /[{(]/.test(len.rest) || PLACE_RE.test(value) || EVERY_RE.test(value)) return true
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
// line, or other patterns' names), steps, notes or chords. Braces holding steps are steps.
function shapeOf(value, st, blocks = null) {
  // A length in front of rest or steps is steps: 2 beats rest, dd. So are hits spread
  // over steps: 3 in 8
  const drawn = (text) => tokenize(text).every((t) => stepsToken(t, st, blocks))
  const measured = (text) => {
    if (EUCLID_RE.test(text)) return true
    const len = lengthAt(text)
    return !!len && (len.thing === "rest" || (len.thing !== "" && drawn(len.thing)))
  }
  const parts = value.split(",").map((p) => p.trim())
  if (parts.some(measured) && parts.every((p) => measured(p) || drawn(p))) return "steps"
  if (tokenize(value).every((t) => t === "|" || STICKING_RE.test(t) || st.words[t]?.type === "sticking")) {
    return "sticking"
  }
  const tokens = tokenize(value)
  const stepsLike = tokens.every((t) => stepsToken(t, st, blocks))
  if (stepsLike && tokens.some((t) => blocks?.[t])) return "steps"
  if (patternText(value)) return "pattern"
  // Beats, which are steps written by where they hit: -|3 dd
  if (stepsLike && tokens.some((t) => BEAT_RE.test(t))) return "steps"
  if (tokens.some((t) => st.sections[t])) return "pattern"
  const key = keyOf(st)
  const steps = tokens.every((t) => isStepRun(t) || t === "|" || st.words[t]?.type === "steps")
  const chords = tokens.every(
    (t) => CHORD_MARKS.includes(t) || st.words[t]?.type === "chords" || buildChord(t, key),
  )
  // Only rests and bar lines are both (- - | -), and they're steps.
  if (steps && chords) return "steps"
  if (steps || chords) return steps ? "steps" : "chords"
  // Letters on their own (F G) read as a chart above; with - or _ among them, as notes.
  const notes = tokens.every((t) => t === "|" || noteSteps(t) || st.words[t]?.type === "notes")
  return notes ? "notes" : "pattern"
}

// Names a pattern (pattern name = { ... }) in `st`, the state of the block it's written
// in. Returns the pattern, or null if the name or length is a mistake.
function defineBlock(l, st, err) {
  const problem = nameProblem(l.name, "{") || nameRule("pattern", l.name, st)
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
  if (type && type !== "pattern" && /^with(\s|\{|$)/.test(value)) {
    // chords verse = with key E { ... }: a with holds what plays, which a value doesn't
    err(ln, `A with's block plays, so it goes around a line or a play, not after ${type} ${name} =`)
    return null
  }
  const shape = shapeOf(value, st, blocks)
  // How the value reads in a message, with its blocks as { ... }
  let shown = value.replace(/\{#\d+\}/g, "{ ... }").replace(/\s+/g, " ")
  if (shape === "notes") shown = spaceNotes(shown)
  if (!type) {
    if (!patternText(value)) {
      if (SETTINGS.includes(lower)) {
        err(ln, `${lower} is a setting, not a name, so it takes no =: set ${lower} ${value}`)
        return null
      }
      if (evalNumber(value)) {
        // A number can only be a setting, so this is a misspelt or made-up one.
        const best = closest(lower, SETTINGS)
        err(
          ln,
          best[1] <= 2
            ? `"${name}" isn't a setting. Did you mean set ${best[0]}?`
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
    const line = { steps: "kick: ", notes: "guitar: ", chords: "piano: chords " }[shape]
    err(
      ln,
      `${shown} is ${shape}, not a pattern. Write ${shape} ${name} = ${shown}, ` +
        `or give them an instrument: pattern ${name} = ${line}${shown}`,
    )
    return null
  } else if (
    (type === "chords" || type === "notes") &&
    !lengthPrefix(value).has &&
    tokenize(value).some((t) => blocks?.[t]) &&
    tokenize(value).every(
      (t) => !blocks?.[t] || !blocks[t].lines.some((l) => TRACK_RE.test(l.text)),
    )
  ) {
    // chords verse = { ... } holding chords, not instruments' lines
    err(ln, type === "chords" ? CHORDS_BLOCK : NOTES_BLOCK)
    return null
  } else if (
    type !== shape &&
    (type === "notes"
      ? /[{(]/.test(value) || PLACE_RE.test(value) || EVERY_RE.test(value) || TRACK_RE.test(value)
      : patternText(value))
  ) {
    // Anything else that isn't the declared type is said more exactly by defineWord. A
    // length is notes too (notes gap = 1 bars rest), so only braces and lines say pattern.
    err(ln, `That's a pattern, not ${type}. Write pattern ${name} = ...`)
    return null
  }
  return type === "pattern"
    ? { kind: "blockdef", ln, name, value, blocks }
    : { kind: "word", ln, type, name, value, blocks }
}

// bar 2 { ... }, bar 2 hat.pedal: 4, bar 3 to 4 fill: what plays in those bars of the
// block it's in, and nowhere else. Returns { kind: "placed", from, to, lines }, where
// `lines` is what plays there, or null after saying what's wrong.
function readPlace(text, { ln, blocks }, err) {
  const nums = numbers(text)
  const first = nums.sumAt(3)
  const to = first && /^\s+to(?![A-Za-z0-9])\s*/.exec(text.slice(first.end))
  const last = to ? nums.sumAt(first.end + to[0].length) : first
  if (!first || !last) {
    err(
      ln,
      "bar takes the number of a bar, then what plays there: bar 2 { ... }, or bar 3 to 4 { ... }",
    )
    return null
  }
  const [from, until] = [first.e.value, last.e.value]
  if (!Number.isInteger(from) || !Number.isInteger(until) || from < 1 || until > MAX_BARS) {
    err(ln, `Bars are counted from 1, up to ${MAX_BARS}: bar 1, bar 2`)
    return null
  }
  if (until < from) {
    err(ln, `bar ${from} to ${until} runs backwards. The first bar comes first`)
    return null
  }
  const rest = text.slice(last.end).trim()
  const shown = text.slice(0, last.end).trim()
  if (!rest) {
    err(ln, `${shown} needs what plays there: ${shown} { ... }`)
    return null
  }
  // bar 2 { ... }: the braces are the bar's own lines, so they fill the bar directly
  const braces = BLOCK_KEY.test(rest) && blocks?.[rest]
  const lines = braces ? braces.lines : [{ ln, text: rest, blocks }]
  return { kind: "placed", ln, from, to: until, lines }
}

// every 3 steps { ... }, every 1/3 beats hats: what plays at that pace, where one step
// lasts that long. Returns { kind: "paced", n, unit, shown, line }, where `line` is what
// plays, or null after saying what's wrong.
function readPace(text, { ln, blocks }, err) {
  const len = lengthAt(text.slice(5).trim())
  if (!len) {
    err(ln, "every takes a length, then what plays at that pace: every 3 steps { ... }")
    return null
  }
  const shown = `every ${len.shown}`
  if (!len.thing) {
    err(ln, `${shown} needs what plays at that pace: ${shown} { ... }`)
    return null
  }
  return {
    kind: "paced",
    ln,
    n: len.n,
    unit: len.unit,
    shown,
    line: { ln, text: len.thing, blocks },
  }
}

// How long a step lasts inside every 3 steps, in ticks, or null after saying it can't
// last that. steps are the steps of what it's in, so every 2 steps inside it doubles again.
function paceTicks(l, st, err) {
  const ticks = l.n * { steps: st.stepTicks, beats: TPQ, bars: meterOf(st).barTicks }[l.unit]
  if (l.n > 0 && nearWhole(ticks) && ticks >= 8) return Math.round(ticks)
  err(l.ln, `A step can't last ${l.shown.slice(6)}. Try every 3 steps, or every 1/3 beats`)
  return null
}

// set tempo 90, set key D, set guitar.electric muted: a setting and its value, from here to
// the end of the cell and into later cells. Returns { kind: "setting" } or null after saying
// what's wrong.
function readSetting(text, tokens, ln, err) {
  const raw = tokens[1] || ""
  if (!raw) {
    err(ln, message("set.empty"))
    return null
  }
  const s = settingWords(raw, text.replace(/^set\s+/, "").slice(raw.length).trim(), ln, err, "set")
  return s && { kind: "setting", ln, ...s }
}

// A setting's name and its value, as written after `verb`: set, or with in a with's header.
// Returns { name, value }, or null after saying what's wrong.
function settingWords(raw, value, ln, err, verb) {
  const name = raw.toLowerCase()
  if (SETTINGS.includes(name)) {
    if (value) return { name, value }
    err(ln, message("set.needsValue", { verb, name }))
    return null
  }
  if (SOUNDS[name]) {
    if (value) return { name, value }
    err(ln, message("set.needsSound", { verb, name }))
    return null
  }
  if (PITCHED.includes(name)) {
    err(ln, message("set.oneSound", { name }))
    return null
  }
  const [best, far] = closest(name, [...SETTINGS, ...Object.keys(SOUNDS)])
  err(
    ln,
    far <= 2
      ? message("set.unknownNear", { raw, verb, best })
      : message("set.unknown", { raw, verb }),
  )
  return null
}

// The settings in a with's header (key E, mode minor), each a setting and its value, with
// commas between them. Returns [{ name, value }], or null after saying what's wrong.
const WITH_HELP = "with takes the settings its block plays with, then the block: with octave 2 { ... }"
function readWithHeader(head, ln, err) {
  if (!head.trim()) {
    err(ln, WITH_HELP)
    return null
  }
  const pieces = head.split(",").map((p) => p.trim())
  const out = []
  for (const [k, piece] of pieces.entries()) {
    if (!piece) {
      err(ln, "A comma goes between two settings: with key E, mode minor { ... }")
      return null
    }
    const words = piece.split(/\s+/)
    if (words[0] === "set") {
      const fixed = pieces.map((p) => p.replace(/^set\s+/, "")).join(", ")
      err(ln, `A with's settings have no set in front: with ${fixed} { ... }`)
      return null
    }
    // with key E mode minor: two settings, without the comma between them
    const next = words.findIndex((w, i) => i > 0 && (SETTINGS.includes(w) || SOUNDS[w]))
    if (next > 0) {
      const fixed = [...pieces.slice(0, k), words.slice(0, next).join(" ") + ", " + words.slice(next).join(" "), ...pieces.slice(k + 1)]
      err(ln, `Settings in a with are separated by commas: with ${fixed.join(", ")} { ... }`)
      return null
    }
    const s = settingWords(words[0], piece.slice(words[0].length).trim(), ln, err, "with")
    if (!s) return null
    if (out.some((o) => o.name === s.name)) {
      err(ln, `${s.name} is in this with twice. A with sets each setting once`)
      return null
    }
    out.push(s)
  }
  return out
}

// The state inside a with: `state` with the header's settings applied, or null after saying
// what's wrong.
function withState(settings, state, ln, err) {
  const st = cloneState(state)
  for (const s of settings) if (!applySetting(s.name, s.value, ln, st, err, "with")) return null
  return st
}

// What a with's time, tempo and swing set: the block plays at its own pace, so it can't
// sound together with other lines. Returns the first of them, or undefined.
const OWN_PACE = ["time", "tempo", "swing"]
const pacing = (settings) => settings.find((s) => OWN_PACE.includes(s.name))

// Sorts one line (not play) into a setting, a word, a named pattern ("blockdef"), an
// instrument line ("part"), patterns to play ("sequence"), something in a bar ("placed")
// or something at its own pace ("paced"). Returns null when the line
// is a mistake, after reporting it. A line's patterns without a name are in `blocks`.
// `st` is the state so far, for the names it has.
function classify({ ln, text, blocks }, err, st) {
  const sections = st.sections
  if (singularLength(text, ln, err)) return null
  if (PLACE_RE.test(text)) return readPlace(text, { ln, blocks }, err)
  if (EVERY_RE.test(text)) return readPace(text, { ln, blocks }, err)
  if (/^bars(\s|$)/.test(text)) {
    err(
      ln,
      "bars is a length, and goes after a number: 6 bars groove. To say which bars, write bar: bar 3 to 4 { ... }",
    )
    return null
  }

  const decl = readDecl(text)
  if (decl) return classifyDecl(decl, { ln, blocks }, err, st)

  const m = TRACK_RE.exec(text)
  // ( ... ) or 4 bars ( ... ): what plays in order, whatever lines are in it
  if (!m && lengthPrefix(text).rest.startsWith("(")) {
    const items = readSequence(text, ln, err, blocks, st)
    return items && { kind: "sequence", ln, items }
  }
  if (!m) {
    const tokens = tokenize(text)
    const first = tokens[0] || ""
    const after = tokens.slice(1).join(" ")
    const noEquals = NO_EQUALS_RE.exec(text)
    if (first === "set") return readSetting(text, tokens, ln, err)
    if (/^with(\s|\{|$)/.test(text)) {
      // with octave 2 { ... }: a block, played with those settings
      const items = readSequence(text, ln, err, blocks, st)
      return items && { kind: "sequence", ln, items }
    }
    if (text.startsWith("|")) {
      err(ln, "A line that starts with | continues the line above it, and there's no line above to continue")
    }
    else if (noEquals && !(noEquals[1] === "chords" && buildChord(noEquals[2], keyOf(st)))) {
      const [, type, name, value] = noEquals
      err(ln, `${type} ${name} needs = before what it holds: ${type} ${name} = ${value}`)
    } else if (/^pattern(\s|$)/.test(text)) {
      err(ln, patternHint(text))
    } else if (
      PITCHED.includes(first.toLowerCase()) &&
      /^[a-z]+$/.test(after) &&
      !st.words[after]
    ) {
      // guitar.electric muted is a setting, so it starts with set
      const name = first.toLowerCase()
      if (SOUNDS[name]) {
        err(ln, `${name} ${after} is a setting, so it starts with set: set ${name} ${after}`)
        return null
      }
      const choice = Object.entries(SOUNDS).map(([i, s]) => `${i} (${s.join(", ")})`)
      err(ln, `${name} has one sound. Instruments with more: ${choice.join(", ")}`)
    } else if (PARTS.includes(first.toLowerCase()) && after) {
      err(ln, `Put a colon after ${first}: ${first}: ${after}`)
    } else if (first === "chords" && after) {
      err(ln, `Chords go on an instrument's line: ${"piano"}: ${text}`)
    } else if (first === "notes" && after) {
      err(ln, `Notes go on an instrument's line: guitar: ${spaceNotes(after)}`)
    } else if (SETTINGS.includes(first.toLowerCase())) {
      // tempo 90 is a setting, so it starts with set
      const name = first.toLowerCase()
      const value = text.slice(first.length).trim() || SETTING_EXAMPLE[name]
      err(ln, `${name} is a setting, so it starts with set: set ${name} ${value}`)
    } else if (after && evalNumber(after) && closest(first.toLowerCase(), SETTINGS)[1] <= 2) {
      err(
        ln,
        `"${first}" isn't a setting. Did you mean set ${closest(first.toLowerCase(), SETTINGS)[0]}?`,
      )
    } else if (
      !sections[first.replace(/^\(+/, "").split("*")[0]] &&
      buildChord(first, parseKey("C"))
    ) {
      err(ln, `Chords go on an instrument's line, e.g. ${"piano"}: chords ${text}`)
    } else if (!tokens.some((t) => sections[t]) && tokens.some(drawsNotes)) {
      err(ln, `Notes go on an instrument's line, e.g. guitar: ${spaceNotes(text)}`)
    } else if (/^[A-Za-z(*\d{]/.test(first)) {
      // intro verse verse: patterns to play, one after another
      const items = readSequence(text, ln, err, blocks, st)
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
    err(ln, `${name} is a setting, not an instrument, so it takes no colon: set ${name} ${value}`)
    return null
  }
  if (PARTS.includes(name) || name === "sticking") {
    if (!value) {
      err(ln, `${name}: needs something after the colon`)
      return null
    }
    if (PITCHED.includes(name)) return { kind: "part", ln, name, value, pitched: true, blocks }
    // sticking: RLRR LRLL: which hand plays each step, shown on the hands' hits
    if (name === "sticking") return { kind: "part", ln, name, value, sticking: true, blocks }
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

// One instrument's line.
function readPart(part, st, barTicks, err) {
  if (part.sticking) {
    const pattern = stickingPattern(part, st, err)
    return pattern && { ...pattern, part }
  }
  if (part.pitched) {
    const pattern = pitchedPattern(part, st, barTicks, err)
    return pattern && { ...pattern, part }
  }
  // A drum's line: its parts, with any lengths written out as the steps they stand for.
  // A block on it is the whole line.
  if (part.blocks && !BLOCK_KEY.test(part.value.trim())) {
    err(part.ln, blockBeside(`${part.name} plays`, (fig) => `${part.name}: x--- ${fig}`))
    return null
  }
  const parts = stepParts(part.value, part.blocks, st, err, part.ln, part)
  if (!parts) return null
  const pattern = listsBeats(parts.tokens)
    ? beatPattern(part, parts.tokens, st, barTicks, err)
    : stepPattern(part, parts.tokens, st, err, parts.toEnd, parts.fill)
  return pattern && { ...pattern, part }
}

// ---------------------------------------------------------------------------
// Clips: what lines, a block, or blocks in a row sound like.
// Times are in seconds from the clip's start; `spans` describe the bar grid over time.
// ---------------------------------------------------------------------------

// Where something is being played from. In a pattern everything repeats until it ends; in
// a play, lines play once and only patterns repeat.
const blockCtx = (name, ln) => ({
  ln,
  repeats: true,
  where: `in ${name}`,
  what: name,
  sized: `pattern ${name} = 4 bars {`,
})
const playCtx = (ln) => ({
  ln,
  repeats: false,
  where: "in this play",
  what: "This play",
  sized: "play 4 bars { ... }",
})
// A play's own length is how long its output is: what's in it is cut there, so it doesn't
// have to fit.
const outputCtx = (ln) => ({ ...playCtx(ln), cuts: true })
const anonCtx = (ln) => ({
  ln,
  repeats: true,
  where: "in this pattern",
  what: "This pattern",
  sized: "4 bars { ... }",
})
// A with's block is a pattern of its own, played with the with's settings.
const withCtx = (ln, shown) => ({
  ...anonCtx(ln),
  where: "in this with",
  what: "This with",
  sized: `4 bars ${shown} { ... }`,
})
// What plays at its own pace is a pattern of its own, whose length comes from its lines
// or from a length in front of its braces.
const paceCtx = (ln) => ({
  ...anonCtx(ln),
  where: "at this pace",
  sized: "every 3 steps 4 bars { ... }",
})
// What plays in a bar is a pattern that lasts that bar.
const placeCtx = (l) => {
  const bars = l.from === l.to ? `bar ${l.from}` : `bar ${l.from} to ${l.to}`
  return { ln: l.ln, repeats: true, where: `in ${bars}`, what: `What's in ${bars}` }
}

// A sticking names a hand on a step where no hand plays: said at the end, once the whole
// play is together, since the hits may come from another pattern than the sticking.
function checkStickings(clip, err) {
  const feet = new Set(["kick", "hat.pedal", "sticking"])
  const moment = (e) => Math.round(e.secStart * 1e6)
  const played = new Set(clip.drumEvents.filter((e) => !feet.has(e.lane)).map(moment))
  for (const e of clip.drumEvents) {
    if (e.lane !== "sticking" || played.has(moment(e))) continue
    const span = clip.spans.find((s) => e.secStart >= s.startSec - 1e-9 && e.secStart < s.startSec + s.durSec)
    let where = ""
    if (span) {
      const tick = Math.round((e.secStart - span.startSec) / span.secPerTick)
      const bar = Math.floor(tick / span.barTicks) + 1
      const beat = Math.floor((tick % span.barTicks) / TPQ) + 1
      const sub = { 0: "", 24: "e", 48: "&", 72: "a" }[tick % TPQ] ?? "+"
      where = ` on bar ${bar}, beat ${beat}${sub}`
    }
    err(e.line, `${e.hand}${where} names a hand, but no hand plays there`)
    return
  }
}

// `clip` played end to end until `durSec`. The last time through may be cut short.
function tile(clip, durSec) {
  const out = { events: [], drumEvents: [], spans: [] }
  if (!(clip.durSec > 0)) return { ...out, durSec } // nothing to repeat
  const times = Math.ceil(durSec / clip.durSec - 1e-6)
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
// the longest thing in it. Whatever repeats has to fit, except in a play with a length of
// its own (ctx.cuts), which stops there. A line ended in ... (`open`) plays once, has no
// say in the length, and has to fit in it.
function layer(parts, once, repeated, st, bars, err, ctx) {
  const meter = meterOf(st)
  const { barTicks, secPerTick } = meter
  const read = parts.map((p) => readPart(p, p.st ?? st, barTicks, err)).filter(Boolean)
  if (read.length < parts.length) return null
  if (!read.length && !once.length && !repeated.length) return null
  // One pattern or group on its own, with no length to fill, is what it plays: it may be
  // at a pace of its own, which this block's bars don't measure.
  if (!bars && !read.length && !once.length && repeated.length === 1) return repeated[0].clip
  // What plays together shares one time, tempo and swing. Something that changes them,
  // inside a group, plays at its own pace, so it can only sound on its own.
  if (read.length + once.length + repeated.length > 1) {
    const paced = [...once.map((c) => ({ clip: c, what: "What's in this bar", ln: c.ln })), ...repeated]
    for (const r of paced) {
      const own = r.clip.spans.find((s) => s.time !== meter.time || s.tempo !== meter.tempo || s.swing !== meter.swing)
      if (!own) continue
      const which = own.time !== meter.time ? "time" : own.tempo !== meter.tempo ? "tempo" : "swing"
      err(
        r.ln,
        `${r.what} changes the ${which}, so it can't sound together with other lines. ` +
          `Play it on its own, or put the with around the whole play: with ${which} ${which === "time" ? own.time : own[which]} { play ... }`,
      )
      return null
    }
  }
  const fixed = read.filter((p) => !p.open)
  const loops = [
    ...(ctx.repeats
      ? fixed.map((p) => ({ what: `The ${p.part.name} line`, ticks: p.ticks, ln: p.part.ln }))
      : []),
    ...repeated.map((r) => ({ ...r, ticks: r.clip.durSec / secPerTick })),
  ]
  const placed = once.filter((c) => c.until).sort((a, b) => b.until - a.until)[0]
  const named = placed ? placed.until * barTicks : 0 // through the last bar that's named
  const lengths = [
    ...fixed.map((p) => p.ticks),
    ...[...once, ...repeated.map((r) => r.clip)].map((c) => Math.round(c.durSec / secPerTick)),
  ]
  if (!bars && !lengths.length) {
    err(
      ctx.ln ?? read[0].part.ln,
      `Every line ${ctx.where} ends in ..., so nothing says how long it is. Say so: ${ctx.sized}`,
    )
    return null
  }
  let totalTicks
  if (bars) {
    totalTicks = Math.round(bars * barTicks)
    // A length too short for a single tick would be a clip of no length, which nothing
    // can be filled with.
    if (totalTicks < 1) {
      err(ctx.ln, `${fmt(bars)} bars is shorter than the shortest note, so nothing fits in it`)
      return null
    }
  } else if (ctx.repeats) {
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
  } else totalTicks = Math.max(...lengths)
  if (named > totalTicks) {
    err(
      placed.ln,
      `${ctx.what} is ${sayTicks(totalTicks, st, barTicks)} long, so it has no bar ${placed.until}`,
    )
    return null
  }
  if (!(ctx.cuts && bars) && !checkLoops(loops, totalTicks, st, barTicks, err)) return null
  for (const p of read) {
    if (p.open && p.ticks > totalTicks && !(ctx.cuts && bars)) {
      err(
        p.part.ln,
        `${ctx.what} is ${sayTicks(totalTicks, st, barTicks)} long, and the ${p.part.name} ` +
          `line's hits run ${sayTicks(p.ticks, st, barTicks)} before its ...`,
      )
      return null
    }
  }
  const durSec = totalTicks * secPerTick
  // Swing moves the sound, not the writing: secSwing is how much later a hit plays than
  // where it's written, and the grid and the sheet stay straight.
  const warp = swingWarp(st)
  const late = (tick) => (warp ? { secSwing: (warp(tick) - tick) * secPerTick } : {})
  const own = read.map((p) => {
    const line = { ln: p.part.ln, events: [], drumEvents: [], spans: [] }
    for (const e of p.expand(totalTicks, ctx.repeats && !p.open)) {
      if (p.kind === "drum") {
        // A double's second stroke keeps how far it is from the first, to go with it.
        const gap = e.gap ? { gapSec: e.gap * secPerTick } : {}
        line.drumEvents.push({ ...e, secStart: e.tick * secPerTick, ...gap, ...late(e.tick) })
      } else {
        line.events.push({
          ...e,
          secStart: e.tick * secPerTick,
          secDur: e.ticks * secPerTick,
          ...late(e.tick),
        })
      }
    }
    return line
  })
  const clips = [...once, ...repeated.map((r) => ({ ...tile(r.clip, durSec), ln: r.ln }))]
  // In the order they're written, so what plays at the same moment keeps that order.
  const all = [...own, ...clips].sort((a, b) => a.ln - b.ln)
  const inside = (e) => e.secStart < durSec - 1e-9
  const moment = (e) => Math.round(e.secStart * 1e6)
  // Where two lines give an instrument a note at the same moment, the lower line's is the
  // one played, as with a drum. Layers in an instrument's block are voices of their own.
  const sounded = new Map() // instrument, voice and moment → the line that won, and its note
  const lost = new Set()
  all.forEach((c, from) => {
    for (const e of c.events) {
      if (!e.note || !inside(e)) continue
      const at = `${e.instrument} ${e.voice} ${moment(e)}`
      const had = sounded.get(at)
      if (had && had.from !== from) lost.add(had.e)
      sounded.set(at, { from, e })
    }
  })
  const events = all
    .flatMap((c) => c.events)
    .filter((e) => inside(e) && !lost.has(e))
    // A note still sounding at the end stops there.
    .map((e) => (e.secStart + e.secDur > durSec ? { ...e, secDur: durSec - e.secStart } : e))
  // A hi-hat can't be open and closed at once, so an open hit replaces a closed one at the
  // same moment. The next hi-hat hit closes it.
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

// What plays in a block: its instruments' lines, patterns, bars and paces.
const PLAYS = ["part", "sequence", "placed", "paced"]

// Inside a block, settings go on a with, which holds the lines they're for.
const setInBlock = (l) => `Inside a block, settings go on a with: with ${l.name} ${l.value} { ... }`

// Reads a block's lines in order, so each one sees the names given before it. Names are
// defined in `st`, and each line that plays keeps the state as it was there, in `l.st`.
// `named` is called with each pattern that gets a name. A block's lines play together, so
// a with on a line of its own that sets its own time, tempo or swing has to be the only
// line that plays.
function readLines(lines, st, err, named) {
  const read = []
  for (const line of lines) {
    const l = classify(line, err, st)
    if (!l) continue
    read.push(l)
    if (PLAYS.includes(l.kind)) l.st = cloneState(st)
    if (l.kind === "setting") err(l.ln, setInBlock(l))
    else if (l.kind === "word") defineWord(l.type, l.name, l.value, l.ln, st, err, l.blocks)
    else if (l.kind === "blockdef") {
      const sec = defineBlock(l, st, err)
      if (sec && named) named(sec)
    }
  }
  if (read.filter((l) => PLAYS.includes(l.kind)).length < 2) return read
  return read.filter((l) => {
    const own = l.kind === "sequence" && l.items[0].with && pacing(l.items[0].with)
    if (!own) return true
    err(
      l.ln,
      `The lines of a play or a pattern play together, so they share one ${own.name}. Put the with around the whole play, ` +
        `with ${own.name} ${own.value} { play ... }, or on a part that plays in order: ( with ${own.name} ${own.value} { ... } )`,
    )
    return false
  })
}

// What something that repeats is called when it doesn't fit.
const loopName = (it) => it.name || (it.items ? "This group" : it.with ? "This with" : "This pattern")

// A block of steps is the whole of what it's written on: a kit piece's line, a layer, or
// the steps a name holds. That way two blocks never sit in a row, where a newline between
// them would be all that told together from in order. Steps go in a row with a block by name.
export const blockBeside = (what, written, fig = "fig") =>
  `A block is everything ${what}, so nothing goes beside it. ` +
  `To put steps in a row with a block, name it: steps ${fig} = { ... } and ${written(fig)}`

// Each instrument has one line in a block. Its layers go in a block on that line.
const secondLine = (name, where) =>
  `${name} already has a line ${where}. To layer it, put its lines in a block: ${name}: { ... }`

// Lines in braces are one block: they play together, and what's defined inside stays
// inside. `bars` is the length written in front of the block, if any. In a pattern every
// line repeats; in a play a line of patterns repeats only when it's one pattern on its own.
// What's put in a bar (bar 2 { ... }) plays there once each time through the block.
function blockClip(lines, state, err, ctx, stack, bars = 0) {
  const st = cloneState(state)
  const read = readLines(lines, st, err)
  // The block's time, tempo and swing, which all of its lines share
  const head = st
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
    const clip = sequenceClip(l.items, l.st, err, l.ln, stack)
    if (!clip) return null
    // A pattern or a group on a line of its own repeats until what it's in ends.
    repeated.push({ clip, what: loopName(l.items[0]), ln: l.ln })
  }
  for (const l of read) {
    if (l.kind !== "paced") continue
    // What's after every is a pattern of its own, where a step lasts that long.
    const ticks = paceTicks(l, l.st, err)
    if (!ticks) return null
    const clip = blockClip([l.line], { ...l.st, stepTicks: ticks }, err, paceCtx(l.ln), stack)
    if (!clip) return null
    repeated.push({ clip, what: "This pattern", ln: l.ln })
  }
  for (const l of read) {
    if (l.kind !== "placed") continue
    // What's in a bar repeats to fill it, and plays once each time through this block.
    const clip = blockClip(l.lines, l.st, err, placeCtx(l), stack, l.to - l.from + 1)
    if (!clip) return null
    const { barTicks, secPerTick } = meterOf(head)
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
  return layer(parts, once, repeated, head, bars, err, ctx)
}

// Plays a pattern, with or without a name, with the settings in effect where it's played.
function sectionClip(sec, state, err, ln, stack) {
  if (sec.shown) return blockClip(sec.lines, state, err, withCtx(sec.ln, sec.shown), stack, sec.bars)
  if (sec.anon) return blockClip(sec.lines, state, err, anonCtx(sec.ln), stack, sec.bars)
  if (stack.includes(sec.name)) {
    err(ln, `${sec.name} plays itself, so it would never end`)
    return null
  }
  return blockClip(sec.lines, state, err, blockCtx(sec.name, ln), [...stack, sec.name], sec.bars)
}

function undefinedName(name, st) {
  const word = st.words[name]
  if (word) {
    return word.type === "steps"
      ? `${name} is steps, so it goes on a drum's line: hat: ${name}`
      : `${name} is ${word.type}, so it goes on an instrument's line: piano: ${word.type === "chords" ? "chords " : ""}${name}`
  }
  // Bridge can't have been named, so the message is the rule, not how to name it
  if (!/^[a-z]/.test(name)) {
    return `"${name}" can't be a name, since names start with a lowercase letter: ${name[0].toLowerCase()}${name.slice(1)}`
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
    readPart(l, l.st, meterOf(l.st).barTicks, err)
  })
  const names = (items, ln, at) => {
    for (const it of items) {
      if (it.items) names(it.items, ln, at)
      else if (it.block) {
        // a with's block is checked with its settings
        const inner = it.with ? withState(it.with, at, ln, err) : at
        if (inner) checkSection(it.block, inner, err, owner)
      }
      else if (it.name === owner) err(ln, `${owner} plays itself, so it would never end`)
      else if (!at.sections[it.name]) err(ln, undefinedName(it.name, at))
    }
  }
  for (const l of read) {
    if (l.kind === "sequence") names(l.items, l.ln, l.st)
    // What's in a bar is a pattern of its own
    else if (l.kind === "placed") {
      checkSection({ anon: true, ln: l.ln, lines: l.lines, bars: 0 }, l.st, err, owner)
    } else if (l.kind === "paced") {
      // ...and so is what plays at its own pace, where a step lasts that long
      const ticks = paceTicks(l, l.st, err)
      const inner = ticks ? { ...l.st, stepTicks: ticks } : l.st
      checkSection({ anon: true, ln: l.ln, lines: [l.line], bars: 0 }, inner, err, owner)
    }
  }
  // A line that's already been reported as a mistake doesn't need this too.
  const playable = read.some((l) => PLAYS.includes(l.kind))
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

// How many ( in `text` are still open at its end. A block inside it is a {#1} by now, so
// only the line's own brackets count.
function openParens(text) {
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
function readSequence(line, ln, err, blocks = {}, st = null) {
  const text = line.replace(/^\s+|\s+$/g, "")
  let i = 0
  let ok = true
  const fail = (msg) => {
    if (ok) err(ln, msg)
    ok = false
  }
  const ws = () => {
    while (/\s/.test(text[i] || "")) i++
  }
  const undefinedItem = (it) => (it.name && st && !st.sections[it.name] ? it.name : null)
  let last = null // the thing read last, which a * after it would want repeated
  const said = (it) => it?.name || (it?.items ? "( ... )" : it ? "{ ... }" : "groove")
  // One thing, at i: what's written in front of it, then a group, a block, a line of its
  // own (in a group), or a name. null after saying what's wrong.
  const item = (inGroup) => {
    const it = thing(inGroup)
    if (it) last = it
    return it
  }
  const thing = (inGroup) => {
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
      return { with: settings, shown: `with ${head.trim()}`, block: blocks[close[0]], bars }
    }
    const key = /^\{#\d+\}/.exec(text.slice(i))
    if (key && blocks?.[key[0]]) {
      i += key[0].length
      return { block: blocks[key[0]], bars }
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
      const lines = [{ ln, text: own, blocks: Object.keys(theirs).length ? theirs : null }]
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
    i += name[0].length
    return { name: name[0], bars }
  }
  // What's in a group, up to its ), in order
  const group = () => {
    const out = []
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
    if (missing) fail(undefinedName(missing, st))
    else {
      const shown = text.replace(/\{#\d+\}/g, "{ ... }").replace(/\s+/g, " ")
      fail(`What plays in order goes in brackets: (${shown})`)
    }
    return null
  }
  return [first]
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
    // A with's block plays with its settings, and what's around it keeps its own
    const inner = it.with ? withState(it.with, state, ln, err) : state
    if (!inner) return null
    // A length in front of a pattern's name repeats it for that long. In front of braces
    // it is the block's own length, which is the same thing when the block has one, and
    // the only thing when its lines end in ... and it has none.
    let clip = it.items
      ? sequenceClip(it.items, state, err, ln, stack)
      : it.block
        ? sectionClip({ ...sec, bars: it.bars || sec.bars, shown: it.shown }, inner, err, ln, stack)
        : sectionClip(sec, state, err, ln, stack)
    if (!clip) return null
    if (it.bars && !it.block) {
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

// Grid cells per quarter note: the coarsest that still shows every hit, and where every
// note stops.
function gridResolution(drumEvents, noteEvents, barTicks) {
  const ticks = [
    ...drumEvents.filter((e) => !e.hidden).map((e) => e.tick),
    ...noteEvents.flatMap((e) => [e.tick, e.tick + e.ticks]),
  ]
  for (const res of [1, 2, 4, 3, 6, 8, 12]) {
    const cell = TPQ / res
    if (barTicks % cell === 0 && ticks.every((t) => t % cell === 0)) return res
  }
  return 24
}

// Joins neighbouring spans in the same meter, then gives each its drum hits, notes and
// chords as ticks from its start — the shape the grid and the sheet draw.
function gridBlocks(spans, drumEvents, noteEvents, chordEvents = []) {
  const merged = []
  for (const s of [...spans].sort((a, b) => a.startSec - b.startSec)) {
    const last = merged[merged.length - 1]
    if (
      last &&
      last.time === s.time &&
      last.tempo === s.tempo &&
      last.key === s.key &&
      last.mode === s.mode &&
      Math.abs(last.startSec + last.durSec - s.startSec) < 1e-6
    ) {
      last.durSec += s.durSec
    } else merged.push({ ...s })
  }
  return merged.map((s) => {
    const inside = drumEvents
      .filter((e) => e.secStart >= s.startSec - 1e-9 && e.secStart < s.startSec + s.durSec - 1e-9)
      .map((e) => ({ ...e, tick: Math.round((e.secStart - s.startSec) / s.secPerTick) }))
    const within = (events) =>
      events
        .filter((e) => e.secStart >= s.startSec - 1e-9 && e.secStart < s.startSec + s.durSec - 1e-9)
        .map((e) => ({
          ...e,
          tick: Math.round((e.secStart - s.startSec) / s.secPerTick),
          ticks: Math.round(e.secDur / s.secPerTick),
        }))
    const notes = within(noteEvents)
    const barSec = s.barTicks * s.secPerTick
    return {
      ...s,
      bars: Math.ceil(s.durSec / barSec - 1e-6), // a part bar still gets a row
      plays: [s.startSec],
      times: 1,
      drumEvents: inside,
      noteEvents: notes,
      chordEvents: within(chordEvents),
      res: gridResolution(inside, notes, s.barTicks),
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
  const err = (line, said) => {
    const msg = ofShown(said)
    if (!errors.some((e) => e.line === line && e.msg === msg)) errors.push({ line, msg })
  }
  const state = cloneState(inherited)
  // Names from the cells above are marked so: this cell can define them again
  for (const n in state.words) state.words[n] = { ...state.words[n], above: true }
  for (const n in state.sections) state.sections[n] = { ...state.sections[n], above: true }
  const setHere = new Map() // setting name → the line in this cell that set it
  const outputs = []
  let transposeLine = null

  const raws = String(src || "").split("\n")
  const lines = raws.map((raw, i) => ({ ln: i + 1, text: raw.replace(/\/\/.*$/, "").trim() }))
  // A line that starts with | continues the value of the line above it, at a bar line:
  // notes flats = A3-Ab3-G3-Gb3-, then |F3-E3-Eb3-D3- on the next line. A comment-only line
  // between them is passed over; a blank line, an opening or closing brace end what's above.
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].text.startsWith("|")) continue
    let j = i - 1
    while (j >= 0 && !lines[j].text && raws[j].trim()) j--
    const above = j >= 0 ? lines[j] : null
    if (!above?.text || /[{}]$/.test(above.text) || /^[{}]/.test(above.text)) continue
    above.text = `${above.text.replace(/\|\s*$/, "")} ${lines[i].text}`
    lines[i].text = ""
  }
  for (const l of lines) l.text = joinOf(l.text)

  let anonCount = 0
  // A with that transposes, in a block or around one: the line it's on, for the check that
  // something pitched plays
  const noteTranspose = (body) => {
    for (const l of body) {
      if (/\bwith\b[^{]*\btranspose\s+-?\(?[1-9]/.test(l.text)) transposeLine ??= l.ln
      for (const b of Object.values(l.blocks || {})) noteTranspose(b.lines)
    }
  }

  // Reads the statements in `lines`, the cell's or a with's at the top of it, into `state`.
  // `inWith` is whether they're a with's, whose settings go on the with.
  const run = (lines, state, inWith) => {
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
        const t = cur ? cur.text.replace(/^\s+|\s+$/g, "") : ""
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
          // A group in brackets runs on until its ) closes it, whatever lines it takes: its
          // newlines are kept, since a line of its own inside it ends at one.
          if (openParens(cur.text) > 0 && i + 1 < lines.length) {
            cur.text += "\n"
            text = lines[++i].text
            continue
          }
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
        } else if (/^pattern(\s|$)/.test(head) && !TYPED_RE.test(head)) {
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
      const after = /^(\S+)\s+bars$/.exec(tail)
      err(
        ln,
        after
          ? `A length goes in front of what it measures: ${front(after[1])}`
          : "Nothing can follow a }",
      )
      return false
    }

    for (let i = 0; i < lines.length; i++) {
      const { ln, text } = lines[i]
      if (!text) continue

      if (text.startsWith("}")) {
        err(ln, "This } doesn't close anything")
        continue
      }
      if (singularLength(text, ln, err)) {
        i = skipIfOpen(i)
        continue
      }
      // pattern groove {: a pattern without its =
      if (/^pattern(\s+[A-Za-z][A-Za-z0-9]*)?\s*(=.*)?$/.test(text)) {
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

      // with key E, mode minor { ... }: the statements in its braces, with those settings,
      // which end at its }. What's named inside stays inside, and nothing carries on.
      if (/^with(\s|\{|$)/.test(text)) {
        const open = text.indexOf("{")
        if (open < 0) {
          err(ln, WITH_HELP)
          continue
        }
        let end = null // the line and column of the } that closes it
        for (let j = i, depth = 0; j < lines.length && !end; j++) {
          const t = lines[j].text
          for (let c = j === i ? open : 0; c < t.length && !end; c++) {
            if (t[c] === "{") depth++
            else if (t[c] === "}" && --depth === 0) end = { j, c }
          }
        }
        const settings = readWithHeader(text.slice(4, open), ln, err)
        if (!end) {
          err(ln, "This with needs a } to close it")
          break
        }
        const last = lines[end.j]
        const body =
          end.j === i
            ? [{ ln, text: text.slice(open + 1, end.c).trim() }]
            : [
                { ln, text: text.slice(open + 1).trim() },
                ...lines.slice(i + 1, end.j),
                { ln: last.ln, text: last.text.slice(0, end.c).trim() },
              ]
        if (last.text.slice(end.c + 1).trim()) err(last.ln, "Nothing can follow a }")
        if (!body.some((l) => l.text)) err(ln, "These braces have nothing in them")
        i = end.j
        const inner = settings && withState(settings, state, ln, err)
        if (inner?.transpose && inner.transpose !== state.transpose) transposeLine ??= ln
        // A mistake in the header still has its block read, for the mistakes in that
        run(body, inner || cloneState(state), true)
        continue
      }

      const play = /^play(?:\s+(.*))?$/.exec(text)
      if (play) {
        // play plays what's after it: a block in braces, or one line. play groove and
        // play { groove } are the same thing.
        let rest = (play[1] || "").trim()
        let bars = 0
        let ok = true
        const len = lengthPrefix(rest)
        if (len.has) {
          // play 3 bars { ... }, play 3 bars groove: how long the output is
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
        const lengthAfter = (tail) => /^\S+\s+bars$/.test(tail)
        if (rest.startsWith("{")) {
          const block = readBlock(i, rest.slice(1).trim(), "play")
          if (block.end > i) label = text.replace(/\{.*$/, "{ … }")
          if (!block.body.length) {
            err(ln, "This play has nothing in its braces")
            ok = false
          }
          if (block.tail && !lengthAfter(block.tail) && block.body.length) {
            // play { ... } outro: things in order go in brackets
            err(
              lines[block.end]?.ln ?? ln,
              `What plays in order goes in brackets: play ({ ... } ${block.tail.replace(/\{.*$/, "{ ... }")})`,
            )
            ok = false
            if (/\{/.test(block.tail)) block.end = readBlock(block.end, block.tail, "play", true).end
          } else if (
            !checkTail(block.tail, lines[block.end]?.ln ?? ln, (n) => `play ${n} bars { ... }`)
          ) {
            ok = false
          }
          arg = block.body
          i = block.end
        } else if (rest.includes("{") || openParens(rest) > 0) {
          // play ({ ... } outro): blocks in a group, or a group that runs over several lines
          const line = readBlock(i, rest, "play", true)
          if (line.end > i) {
            const size = bars ? `${fmt(bars)} bars ` : ""
            label = `play ${size}${line.body[0]?.text.replace(/\{#\d+\}/g, "{ … }").replace(/\s+/g, " ").trim() ?? ""}`
          }
          i = line.end
          arg = line.body
          if (!arg.length) ok = false
        }
        noteTranspose(arg)
        const out = ok ? blockClip(arg, state, err, outputCtx(ln), [], bars) : null
        if (out) checkStickings(out, err)
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
            notes: out.events.filter((e) => e.note),
            drumEvents: out.drumEvents,
            blocks: gridBlocks(
              out.spans,
              out.drumEvents,
              out.events.filter((e) => e.note),
              out.events.filter((e) => e.chord),
            ),
          })
        }
        continue
      }

      // steps pair = ^-x-, chords verse = Am F, pattern groove = 3 bars { ... }: a name.
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
        if (decl.value.includes("{") || openParens(decl.value) > 0) {
          const read = readBlock(i, decl.value, decl.name, true)
          i = read.end
          const line = read.body[0]
          if (!line) continue // its braces were a mistake, already reported
          noteTranspose(read.body)
          const after = /^\{#\d+\}\s+(\S+)\s+bars$/.exec(line.text)
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
      // every 3 steps { ... } on its own: nothing plays it
      if (EVERY_RE.test(text)) {
        const shown = text.replace(/\{.*$/, "{ ... }")
        err(ln, `Nothing plays this. Put play in front, or give it a name: pattern slow = ${shown}`)
        i = /\{/.test(text) ? readBlock(i, text, "", true).end : i
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
      if (l.kind === "setting" && inWith) err(ln, setInBlock(l))
      else if (l.kind === "setting") {
        if (applySetting(l.name, l.value, ln, state, err)) {
          setHere.set(l.name, ln)
          if (l.name === "transpose" && state.transpose) transposeLine ??= ln
        }
      } else if (l.kind === "part") {
        // Nothing floats at the top: what plays is inside a pattern or a play.
        err(ln, `An instrument's line goes inside braces: in a pattern, or play { ${text} }`)
      } else err(ln, `Nothing plays this line. Write play ${text}`)
    }

  }
  run(lines, state, false)

  // transpose only moves what has pitch, so one in a cell where only drums play is a
  // mistake. One inherited from a cell above is fine.
  const pitched = outputs.some((o) => o.notes.length || o.chords.length)
  if (transposeLine != null && outputs.length && !pitched) {
    err(
      transposeLine,
      "transpose moves notes and chords, and only drums play here. Give an instrument some: piano: chords C G",
    )
  }

  const start = initialState()
  // What this cell plays with from the cells above: every setting they changed, and every
  // instrument they set to another sound, unless this cell sets it again.
  const fromAbove = [
    ...SETTINGS.filter((k) => !setHere.has(k) && describe(k, inherited) !== describe(k, start)).map(
      (k) => describe(k, inherited),
    ),
    ...Object.entries(inherited.sounds)
      .filter(([instrument]) => !setHere.has(instrument))
      .map(([instrument, sound]) => `${instrument} ${sound}`),
  ]

  // One timeline with every output back to back, for views that show a single player. An
  // event's tick counts from the start of the block it plays in, as the blocks' own events
  // do; a pattern's events count from the pattern, wherever it falls in the block.
  let t = 0
  const events = []
  const drumEvents = []
  const blocks = []
  for (const o of outputs) {
    const place = (e) => {
      const b = o.blocks.find(
        (b) => e.secStart >= b.startSec - 1e-9 && e.secStart < b.startSec + b.durSec - 1e-9,
      )
      const tick = b ? Math.round((e.secStart - b.startSec) / b.secPerTick) : e.tick
      return { ...e, tick, secStart: e.secStart + t }
    }
    events.push(...o.events.map(place))
    drumEvents.push(...o.drumEvents.map(place))
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
    notes: events.filter((e) => e.note),
    drumEvents,
    totalSec: t,
    errors,
    state,
    fromAbove,
  }
}
