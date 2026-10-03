/* The music-cell language. Every line is one of:
     name: value   a setting, or an instrument and what it plays
     name = value  a word you can reuse
     Am F | C G    chords on their own, played by the sound setting (piano unless set)
     -- note       a comment
   Lines next to each other form a block and play together; a blank line starts the next
   block, which plays after it. Settings and words carry on into later blocks and cells.
   Pure (no audio), so the notebook can also use it to pass state from cell to cell. */
import { applyCapo, buildChord, isRoman, parseKey } from "./chords.js"

export const TPQ = 96 // ticks per quarter note: fine enough for 1/32 notes and triplets
export const DRUMS = ["crash", "ride", "hat", "tom", "floor", "snare", "kick"]
export const INSTRUMENTS = ["piano", "epiano", "organ", "pad", "bass", "guitar"]
export const SETTINGS = ["time", "tempo", "step", "bars", "sound", "key", "capo", "octave", "kit"]
export const MODIFIERS = ["accent", "ghost", "double", "open", "pedal", "bell"]
export const KITS = ["rock", "synth"]

const STEP_SIZES = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32]
const MAX_AUTO_BARS = 16
const SUB = { "": 0, e: 0.25, "&": 0.5, a: 0.75 }
// Loop letters are the first letter of the word you'd write after a beat; a capital adds
// an accent.
const LOOP_STEPS = {
  x: {},
  o: { open: true },
  p: { pedal: true },
  b: { bell: true },
  g: { ghost: true },
  d: { double: true },
}
const RESERVED = new Set([
  ...SETTINGS,
  ...DRUMS,
  ...INSTRUMENTS,
  ...MODIFIERS,
  ...["i", "ii", "iii", "iv", "v", "vi", "vii"],
])
const RENAMED = {
  inst: "Use sound: guitar",
  instrument: "Use sound: guitar",
  chords: "Write the chords on a line of their own, e.g. Am F | C G. sound: picks the instrument",
  beats: "Use time: 4/4",
  bpm: "Use tempo: 120",
  oct: "Use octave: 3",
  group: "Put the grouping in the time signature: time: (2+2+3)/8",
  pattern: "Give each drum its own line, e.g. ride: b . .",
  repeat: "Write repeat 2: on its own line and indent the lines to repeat under it",
  drums: "Give each drum its own line: kick, snare, hat, ride, crash, tom, floor",
  bd: "Use kick",
  sd: "Use snare",
  hh: "Use hat",
}
const OLD_KIT = {
  "ride bell": "ride, with b steps (ride: b . .) or the word bell (ride: 1 bell)",
  "open hat": "hat, with o steps (hat: x x x o) or the word open (hat: 4 open)",
  "hat pedal": "hat, with p steps (hat: . p . p) or the word pedal (hat: 2 pedal)",
  "floor tom": "floor",
  "high tom": "tom",
  "low tom": "tom",
}

export function initialState() {
  return {
    groups: [4],
    unit: 4,
    tempo: 120,
    step: 16,
    sound: "piano",
    key: "C",
    capo: 0,
    octave: 3,
    kit: "rock",
    words: {},
  }
}

function cloneState(s) {
  return { ...s, groups: [...s.groups], words: { ...s.words } }
}

export function timeLabel(s) {
  return s.groups.length > 1 ? `(${s.groups.join("+")})/${s.unit}` : `${s.groups[0]}/${s.unit}`
}

// Bar length in quarter notes (a beat is always a quarter note).
export function barQuarters(s) {
  return (s.groups.reduce((a, b) => a + b, 0) * 4) / s.unit
}

// The last 16th a bar reaches, counted 1 e & a: a 7/8 bar ends on 4e.
export function lastCount(s) {
  const n = Math.round(barQuarters(s) * 4) - 1
  return Math.floor(n / 4) + 1 + ["", "e", "&", "a"][n % 4]
}

const DESCRIBE = {
  time: (s) => "time " + timeLabel(s),
  tempo: (s) => "tempo " + s.tempo,
  step: (s) => "step 1/" + s.step,
  sound: (s) => "sound " + s.sound,
  key: (s) => "key " + s.key,
  capo: (s) => "capo " + s.capo,
  octave: (s) => "octave " + s.octave,
  kit: (s) => "kit " + s.kit,
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a)
const lcm = (a, b) => (a / gcd(a, b)) * b

function tokenize(value) {
  return value
    .replace(/,/g, " ")
    .replace(/\|/g, " | ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
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

const isLoopStep = (t) => t === "." || (t.length === 1 && !!LOOP_STEPS[t.toLowerCase()])
// Steps can be typed without spaces: x..x... is x . . x . . .
const isStepRun = (t) => [...t].every(isLoopStep)

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

function unknownName(name) {
  if (RENAMED[name]) return RENAMED[name]
  const names = [...SETTINGS, ...INSTRUMENTS, ...DRUMS]
  const best = names
    .map((n) => [n, editDistance(name, n)])
    .sort((a, b) => a[1] - b[1])[0]
  if (best && best[1] <= 2) return `"${name}" isn't an instrument or setting. Did you mean ${best[0]}?`
  return (
    `"${name}" isn't an instrument or setting. ` +
    `Instruments: ${[...INSTRUMENTS, ...DRUMS].join(", ")}. Settings: ${SETTINGS.join(", ")}`
  )
}

const LINE_SHAPES =
  "Each line is name: value (an instrument or setting), name = value (a word), " +
  "chords on their own (Am F | C G), or -- a comment"

// A line of just chords (or chord words), played by the sound setting.
function isChordLine(text, state) {
  const first = tokenize(text)[0]
  return !!first && (!!buildChord(first, parseKey("C")) || !!state.words[first])
}

function applySetting(name, value, ln, state, err) {
  const whole = (lo, hi) => {
    const n = Number(value)
    return Number.isInteger(n) && n >= lo && n <= hi ? n : null
  }
  if (name === "time") {
    const m =
      /^(\d+)\s*\/\s*(\d+)$/.exec(value) ||
      /^\(\s*(\d+(?:\s*\+\s*\d+)+)\s*\)\s*\/\s*(\d+)$/.exec(value)
    if (!m) {
      const added = /^(\d+(?:\s*\+\s*\d+)+)\s*\/\s*(\d+)$/.exec(value)
      err(
        ln,
        added
          ? `Put brackets around added-up beats: time: (${added[1].replace(/\s/g, "")})/${added[2]}`
          : "time looks like 4/4, 7/8 or (3+4)/4",
      )
      return false
    }
    const groups = m[1].split("+").map(Number)
    const unit = Number(m[2])
    if (![2, 4, 8, 16].includes(unit)) {
      err(ln, "The bottom number of time must be 2, 4, 8 or 16")
      return false
    }
    if (groups.some((g) => g < 1 || g > 32)) {
      err(ln, "The top number of time must be between 1 and 32")
      return false
    }
    state.groups = groups
    state.unit = unit
    return true
  }
  if (name === "tempo") {
    const n = Number(value)
    if (!(n >= 20 && n <= 400)) {
      err(ln, "tempo is quarter notes per minute, between 20 and 400")
      return false
    }
    state.tempo = n
    return true
  }
  if (name === "step") {
    const m = /^1\s*\/\s*(\d+)$/.exec(value)
    const n = m && Number(m[1])
    if (!STEP_SIZES.includes(n)) {
      err(ln, "step looks like 1/16, 1/8, or 1/12 for triplets")
      return false
    }
    state.step = n
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

function defineWord(name, value, ln, state, err) {
  if (name !== name.toLowerCase()) return err(ln, `Word names are lowercase: ${name.toLowerCase()} = ...`)
  if (name.length < 2) {
    return err(ln, "Word names need at least two letters, because single letters are loop steps")
  }
  if (RESERVED.has(name)) return err(ln, `${name} already means something, so pick another name`)
  const tokens = []
  for (const t of tokenize(value)) {
    const w = state.words[t]
    if (!w) tokens.push(t)
    else if (w.tokens.every(isStepRun)) tokens.push(...w.tokens)
    else tokens.push("|", ...w.tokens, "|")
  }
  if (!tokens.length) return err(ln, `${name} = needs something after the =`)
  state.words[name] = { tokens, line: ln }
}

// ---------------------------------------------------------------------------
// Chord lines
// ---------------------------------------------------------------------------

function chordSlot(tok, part, st, key, err) {
  if (tok === ".") return { hold: true }
  if (tok === "_") return { rest: true }
  if (tok === "%") {
    err(part.ln, "% stands for a whole bar, so it goes between bar lines on its own: Am F | %")
    return null
  }
  if (/\.(w|h|q|e|s)\.*$/.test(tok) || /:\d/.test(tok)) {
    err(part.ln, `"${tok}": durations like .q are gone. Use . to hold a chord for another slot`)
    return null
  }
  if (/^[a-z][a-z0-9]+$/.test(tok) && !isRoman(tok)) {
    err(part.ln, `"${tok}" isn't a word defined above. Define it first: ${tok} = Am F | C G`)
    return null
  }
  const chord = buildChord(tok, key, st.octave)
  if (!chord) {
    err(part.ln, `"${tok}" isn't a chord I know`)
    return null
  }
  if (part.name === "guitar") applyCapo(chord, st.capo)
  return { chord }
}

function parseChordPart(part, st, barTicks, err) {
  const key = parseKey(st.key)
  const tokens = []
  for (const t of tokenize(part.value)) {
    const w = st.words[t]
    if (w) tokens.push("|", ...w.tokens, "|")
    else tokens.push(t)
  }
  const bars = []
  let ok = true
  for (const bar of splitBars(tokens)) {
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
          "Use . to hold a chord for another slot, e.g. Am . F G",
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
    err(part.ln, `${part.name} has nothing to play`)
    return null
  }
  if (bars[0][0].hold) {
    err(part.ln, "This line starts with . but there's no chord to hold yet")
    return null
  }
  const capo = part.name === "guitar" ? st.capo : 0
  return {
    kind: "chord",
    form: "chords",
    name: part.name,
    ln: part.ln,
    cycle: bars.length * barTicks,
    expand(total) {
      const out = []
      let cur = null
      for (let b = 0; b * barTicks < total; b++) {
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
            instrument: part.name,
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

// ---------------------------------------------------------------------------
// Drum lines: beats (1 2& 3e) or a loop (x . o .)
// ---------------------------------------------------------------------------

function checkHit(name, mods, ln, what, err) {
  const fail = (msg) => {
    err(ln, `${what}: ${msg}`)
    return false
  }
  if (mods.open && name !== "hat") return fail("open only works on hat")
  if (mods.pedal && name !== "hat") return fail("pedal only works on hat")
  if (mods.bell && name !== "ride") return fail("bell only works on ride")
  if (mods.open && mods.pedal) return fail("a hi-hat hit can't be both open and pedal")
  if (mods.accent && mods.ghost) return fail("a hit can't be both accent and ghost")
  return true
}

function pushHit(out, name, tick, mods, doubleGap, ln) {
  const ev = {
    inst: name,
    tick,
    art: mods.open ? "open" : mods.pedal ? "pedal" : mods.bell ? "bell" : "hit",
    vel: mods.accent ? 1 : mods.ghost ? 0.3 : 0.7,
    accent: !!mods.accent,
    ghost: !!mods.ghost,
    double: !!mods.double,
    line: ln,
  }
  out.push(ev)
  if (mods.double) out.push({ ...ev, tick: tick + doubleGap, hidden: true })
}

function parseBeats(part, tokens, st, barTicks, err) {
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
    if (bar.length === 1 && bar[0] === ".") {
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
      } else if (MODIFIERS.includes(tok)) {
        if (hits.length) hits[hits.length - 1].mods[tok] = true
        else fail(`"${tok}" goes after the beat it changes, e.g. 3 ${tok}`)
      } else if (tok === "." || tok === "%") {
        fail(`${tok} stands for a whole bar, so it goes between bar lines on its own: 1 3 | ${tok}`)
      } else if (isLoopStep(tok)) {
        fail(`"${tok}" is a loop step, but this line lists beats. Use beats (1 2& 3) or a loop (x . x .), not both`)
      } else if (st.words[tok]) {
        fail(`${tok} is a word: words work in loops and chord lines, not in lists of beats`)
      } else {
        fail(`"${tok}" isn't a beat. Beats look like 1, 2&, 3e or 4a`)
      }
    }
    for (const h of hits) if (!checkHit(part.name, h.mods, part.ln, h.tok, err)) ok = false
    bars.push(hits)
  }
  if (!ok) return null
  if (!bars.length) {
    err(part.ln, `${part.name} has nothing to play`)
    return null
  }
  return {
    kind: "drum",
    form: "beats",
    name: part.name,
    ln: part.ln,
    cycle: bars.length * barTicks,
    expand(total) {
      const out = []
      for (let b = 0; b * barTicks < total; b++) {
        for (const h of bars[b % bars.length]) {
          pushHit(out, part.name, b * barTicks + h.tick, h.mods, TPQ / 8, part.ln)
        }
      }
      return out
    },
  }
}

function stepHelp(name) {
  const extra = name === "hat" ? ", o (open), p (pedal)" : name === "ride" ? ", b (bell)" : ""
  return `Use x (hit), X (accent), g (ghost), d (double)${extra} or . (rest)`
}

// One loop symbol → hit modifiers; null for a rest, undefined when it isn't valid here.
function loopStep(tok, part, err, viaWord) {
  if (tok === ".") return null
  const where = viaWord ? ` (in ${viaWord})` : ""
  const base = tok.length === 1 ? LOOP_STEPS[tok.toLowerCase()] : null
  if (!base) {
    if (/^[a-z][a-z0-9]+$/.test(tok)) {
      err(part.ln, `"${tok}" isn't a word defined above. Define it first: ${tok} = x . x .`)
    } else {
      err(part.ln, `"${tok}"${where} isn't a loop step. ${stepHelp(part.name)}`)
    }
    return undefined
  }
  const mods = { ...base, accent: tok !== tok.toLowerCase() }
  if (mods.accent && mods.ghost) {
    err(part.ln, `"${tok}"${where}: a ghost note can't be accented`)
    return undefined
  }
  if (!checkHit(part.name, mods, part.ln, `"${tok}"${where}`, err)) return undefined
  return mods
}

function parseLoop(part, tokens, st, err) {
  const steps = []
  let ok = true
  const add = (tok, viaWord) => {
    const s = loopStep(tok, part, err, viaWord)
    if (s === undefined) ok = false
    else steps.push(s)
  }
  // A run like x..x... is one step per character.
  const addRun = (tok, viaWord) => {
    if (tok.length > 1 && isStepRun(tok)) for (const c of tok) add(c, viaWord)
    else add(tok, viaWord)
  }
  for (const tok of tokens) {
    const w = st.words[tok]
    if (!w) {
      addRun(tok)
      continue
    }
    if (!w.tokens.every(isStepRun)) {
      err(part.ln, `${tok} holds chords or bar lines, so it can't go in a drum loop`)
      ok = false
      continue
    }
    for (const t of w.tokens) addRun(t, tok)
  }
  if (!ok) return null
  const stepTicks = (TPQ * 4) / st.step
  return {
    kind: "drum",
    form: "loop",
    name: part.name,
    ln: part.ln,
    cycle: steps.length * stepTicks,
    expand(total) {
      const out = []
      for (let k = 0; k * stepTicks < total; k++) {
        const s = steps[k % steps.length]
        if (s) pushHit(out, part.name, k * stepTicks, s, stepTicks / 2, part.ln)
      }
      return out
    },
  }
}

function parseDrumPart(part, st, barTicks, err) {
  const tokens = tokenize(part.value)
  const beats = tokens.some((t) => /^\d/.test(t) || t === "|" || t === "%")
  return beats ? parseBeats(part, tokens, st, barTicks, err) : parseLoop(part, tokens, st, err)
}

// ---------------------------------------------------------------------------
// Blocks and cells
// ---------------------------------------------------------------------------

// Grid cells per quarter note: the coarsest that still shows every drum hit.
function gridResolution(drumEvents, barTicks) {
  for (const res of [1, 2, 4, 3, 6, 8, 12]) {
    const cell = TPQ / res
    if (barTicks % cell === 0 && drumEvents.every((e) => e.hidden || e.tick % cell === 0)) return res
  }
  return 24
}

// Applies a block's settings and words to `state`, then reads its instrument lines.
// Returns null for a block with nothing to play (only settings, words or errors).
function readBlock(lines, state, setHere, err) {
  const parts = []
  let bars = 0
  let last = null
  let bare = null // the block's chord-only lines, which share one part
  for (const { ln, text } of lines) {
    if (text.startsWith("|")) {
      if (last) last.value += " " + text
      else err(ln, "A line starting with | continues the instrument line above it, but there isn't one")
      continue
    }
    last = null
    if (text.startsWith("@")) {
      err(ln, `"${text.split(/\s+/)[0]}" is the old syntax. Write settings as name: value, e.g. key: Am`)
      continue
    }
    const two = /^([a-z]+ [a-z]+)\s*[:=]/i.exec(text)
    if (two && OLD_KIT[two[1].toLowerCase()]) {
      err(ln, `"${two[1]}" is now ${OLD_KIT[two[1].toLowerCase()]}`)
      continue
    }
    const def = /^([A-Za-z][A-Za-z0-9]*)\s*=\s*(.*)$/.exec(text)
    if (def) {
      defineWord(def[1], def[2].trim(), ln, state, err)
      continue
    }
    const m = /^([A-Za-z][A-Za-z0-9]*)\s*:\s*(.*)$/.exec(text)
    if (!m) {
      if (!isChordLine(text, state)) {
        err(ln, LINE_SHAPES)
        continue
      }
      // Chord-only lines next to each other carry on from one another, a new bar per line.
      if (bare) bare.value += " | " + text
      else {
        bare = { name: null, value: text, ln }
        parts.push(bare)
      }
      last = bare
      continue
    }
    const name = m[1].toLowerCase()
    const value = m[2].trim()
    if (!value) {
      err(ln, `${name}: needs something after the colon`)
      continue
    }
    if (name === "bars") {
      const n = Number(value)
      if (Number.isInteger(n) && n >= 1 && n <= 64) bars = n
      else err(ln, "bars is a whole number from 1 to 64")
      continue
    }
    if (SETTINGS.includes(name)) {
      if (applySetting(name, value, ln, state, err)) setHere.set(name, ln)
      continue
    }
    if (DRUMS.includes(name) || INSTRUMENTS.includes(name)) {
      if (parts.some((p) => p.name === name)) {
        err(ln, `${name} already has a line in this block. To keep writing it, start the next line with |`)
        continue
      }
      last = { name, value, ln }
      parts.push(last)
      continue
    }
    err(ln, unknownName(name))
  }
  if (!parts.length) return null

  // Settings apply to the whole block they're in, wherever they're written, so the
  // chord-only lines get their instrument once the whole block has been read.
  if (bare) {
    if (parts.some((p) => p.name === state.sound)) {
      err(
        bare.ln,
        `This block has a ${state.sound}: line, and lines without a name play ${state.sound} too ` +
          `(sound: ${state.sound}). Put the chords on one of them, or start the other line with another instrument`,
      )
      return null
    }
    bare.name = state.sound
  }
  const st = cloneState(state)
  const barTicks = Math.round(barQuarters(st) * TPQ)
  const read = parts
    .map((p) =>
      DRUMS.includes(p.name)
        ? parseDrumPart(p, st, barTicks, err)
        : parseChordPart(p, st, barTicks, err),
    )
    .filter(Boolean)
  if (read.length < parts.length) return null

  // Every line repeats; the block lasts until they all line up again.
  let ticks = bars * barTicks
  if (!bars) {
    ticks = read.reduce((acc, p) => lcm(acc, p.cycle), barTicks)
    if (ticks / barTicks > MAX_AUTO_BARS) {
      err(
        parts[0].ln,
        `These lines take ${ticks / barTicks} bars to line up. Add bars: to choose how long this block plays`,
      )
      return null
    }
  }

  const chordEvents = []
  const drumEvents = []
  for (const p of read) (p.kind === "drum" ? drumEvents : chordEvents).push(...p.expand(ticks))
  drumEvents.sort((a, b) => a.tick - b.tick)
  chordEvents.sort((a, b) => a.tick - b.tick)
  return {
    line: lines[0].ln,
    time: timeLabel(st),
    groups: st.groups,
    unit: st.unit,
    tempo: st.tempo,
    kit: st.kit,
    barTicks,
    ticks,
    bars: ticks / barTicks,
    secPerTick: 60 / (st.tempo * TPQ),
    durSec: (ticks * 60) / (st.tempo * TPQ),
    res: gridResolution(drumEvents, barTicks),
    parts: read.map((p) => ({ name: p.name, form: p.form, line: p.ln })),
    chordEvents,
    drumEvents,
  }
}

const REPEAT_RE = /^repeat\s+(\S+)\s*:$/i
const MAX_SECONDS = 600

const isContinuation = (l) => l.text.startsWith("|")

// Splits lines into items: blocks (lines next to each other) and repeats, which hold
// the lines indented under them as items of their own. Deeper indentation nests.
function readItems(lines, base, err) {
  const items = []
  let chunk = []
  const flush = () => {
    if (chunk.length) items.push({ kind: "block", lines: chunk })
    chunk = []
  }
  let i = 0
  while (i < lines.length) {
    const l = lines[i]
    if (l.blank) {
      flush()
      i++
      continue
    }
    if (isContinuation(l)) {
      chunk.push(l)
      i++
      continue
    }
    if (l.indent > base) {
      err(l.ln, "This line is indented, but there's no repeat above it. Write repeat 2: above the lines to repeat")
      i++
      continue
    }
    const head = REPEAT_RE.exec(l.text)
    if (!head) {
      chunk.push(l)
      i++
      continue
    }
    flush()
    let j = i + 1
    while (j < lines.length && (lines[j].blank || isContinuation(lines[j]) || lines[j].indent > l.indent)) j++
    while (j > i + 1 && lines[j - 1].blank) j--
    const body = lines.slice(i + 1, j)
    const real = body.filter((b) => !b.blank && !isContinuation(b))
    const n = Number(head[1])
    if (!Number.isInteger(n) || n < 1 || n > 16) err(l.ln, "repeat takes a count from 1 to 16, e.g. repeat 2:")
    else if (!real.length) err(l.ln, `Indent the lines to repeat under repeat ${n}:`)
    else {
      const inner = readItems(body, Math.min(...real.map((b) => b.indent)), err)
      items.push({ kind: "repeat", times: n, items: inner })
    }
    i = j
  }
  flush()
  return items
}

// Plays items one after another, adding each block's start time to `plays`.
// Returns how long the items last.
function playItems(items, state, setHere, err, plays) {
  let t = 0
  for (const it of items) {
    if (it.kind === "block") {
      const b = readBlock(it.lines, state, setHere, err)
      if (b) {
        plays.push({ block: b, at: t })
        t += b.durSec
      }
      continue
    }
    const inner = []
    const dur = playItems(it.items, state, setHere, err, inner)
    for (let k = 0; k < it.times; k++) {
      for (const p of inner) plays.push({ block: p.block, at: t + k * dur + p.at })
    }
    t += dur * it.times
  }
  return t
}

// Parses one music cell. `inherited` is the state left by the cells above (settings and
// words); the result's `state` is what this cell passes on to the cells below.
export function parseCell(src, inherited = initialState()) {
  const errors = []
  const err = (line, msg) => {
    errors.push({ line, msg })
  }
  const state = cloneState(inherited)
  const setHere = new Map() // setting name → the line in this cell that set it

  const lines = String(src || "")
    .split("\n")
    .map((raw, i) => ({
      ln: i + 1,
      text: raw.replace(/(^|\s)--.*$/, "").trim(),
      indent: /^[ \t]*/.exec(raw)[0].replace(/\t/g, "  ").length,
      blank: !raw.trim(),
    }))
    .filter((l) => l.blank || l.text) // comment-only lines don't split blocks
  const real = lines.filter((l) => !l.blank && !isContinuation(l))
  const items = readItems(lines, real.length ? Math.min(...real.map((l) => l.indent)) : 0, err)

  // Blocks play one after another, each at its own tempo; a repeated block plays again.
  let plays = []
  let totalSec = playItems(items, state, setHere, err, plays)
  // A capo only moves guitar chords, so a capo in a cell where nothing plays guitar is a
  // mistake (usually a missing sound: guitar). One inherited from a cell above is fine.
  const guitar = plays.some(({ block }) => block.parts.some((p) => p.name === "guitar"))
  if (setHere.has("capo") && state.capo > 0 && !guitar) {
    err(setHere.get("capo"), "capo only works on guitar. Add sound: guitar, or start the chord line with guitar:")
  }
  if (totalSec > MAX_SECONDS) {
    err(1, "This cell plays for over 10 minutes. Use smaller repeat counts")
    plays = []
    totalSec = 0
  }

  const blocks = []
  const events = []
  const drumEvents = []
  for (const { block: b, at } of plays) {
    if (!b.plays) {
      b.plays = []
      b.startSec = at
      blocks.push(b)
    }
    const again = b.plays.length > 0
    b.plays.push(at)
    for (const e of b.chordEvents) {
      events.push({
        ...e,
        repeat: e.repeat || again,
        secStart: at + e.tick * b.secPerTick,
        secDur: e.ticks * b.secPerTick,
      })
    }
    for (const e of b.drumEvents) drumEvents.push({ ...e, kit: b.kit, secStart: at + e.tick * b.secPerTick })
  }
  for (const b of blocks) b.times = b.plays.length
  events.sort((a, b) => a.secStart - b.secStart)
  drumEvents.sort((a, b) => a.secStart - b.secStart)

  const start = initialState()
  const fromAbove = Object.keys(DESCRIBE)
    .filter((k) => !setHere.has(k) && DESCRIBE[k](inherited) !== DESCRIBE[k](start))
    .map((k) => DESCRIBE[k](inherited))

  errors.sort((a, b) => a.line - b.line)
  return {
    kind: "music",
    blocks,
    events,
    chords: events.filter((e) => e.chord),
    drumEvents,
    totalSec,
    errors,
    state,
    fromAbove,
  }
}
